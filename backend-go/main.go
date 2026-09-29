package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxMemory = 16 << 20

var safeID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,24}$`)

type formatSpec struct {
	Driver   string
	Ext      string
	Multi    bool
	Raster   bool
	ReadOnly bool
}

var formats = map[string]formatSpec{
	"shp":     {Driver: "ESRI Shapefile", Ext: "shp", Multi: true},
	"dxf":     {Driver: "DXF", Ext: "dxf"},
	"dgn":     {Driver: "DGN", Ext: "dgn"},
	"gml":     {Driver: "GML", Ext: "gml"},
	"gpx":     {Driver: "GPX", Ext: "gpx"},
	"gpkg":    {Driver: "GPKG", Ext: "gpkg"},
	"gdb":     {Driver: "OpenFileGDB", Ext: "gdb", Multi: true},
	"tab":     {Driver: "MapInfo File", Ext: "tab", Multi: true},
	"mif":     {Driver: "MapInfo File", Ext: "mif", Multi: true},
	"sqlite":  {Driver: "SQLite", Ext: "sqlite"},
	"geojson": {Driver: "GeoJSON", Ext: "geojson"},
	"csv":     {Driver: "CSV", Ext: "csv"},
	"tif":     {Driver: "GTiff", Ext: "tif", Raster: true},
}

type manifest struct {
	RequestID       string   `json:"requestId"`
	Source          string   `json:"source"`
	Target          string   `json:"target"`
	SourceCRS       string   `json:"sourceCrs"`
	TargetCRS       string   `json:"targetCrs"`
	InputFiles      []string `json:"inputFiles"`
	InputBytes      int64    `json:"inputBytes"`
	OutputBytes     int64    `json:"outputBytes"`
	DurationMS      int64    `json:"durationMs"`
	Validation      string   `json:"validation"`
	OutputFile      string   `json:"outputFile"`
	InputFeatures   int64    `json:"inputFeatures,omitempty"`
	OutputFeatures  int64    `json:"outputFeatures,omitempty"`
	BackendRetained bool     `json:"backendRetained"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"ok":true}`)
	})
	mux.HandleFunc("/v1/convert", convert)
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

func convert(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	reqID := r.Header.Get("X-Request-ID")
	sourceID := strings.ToLower(r.Header.Get("X-XulyVFM-Source"))
	targetID := strings.ToLower(r.Header.Get("X-XulyVFM-Target"))
	sourceCRS := cleanCRS(r.Header.Get("X-XulyVFM-Source-CRS"))
	targetCRS := cleanCRS(r.Header.Get("X-XulyVFM-Target-CRS"))

	if !safeID.MatchString(sourceID) || !safeID.MatchString(targetID) {
		http.Error(w, "bad format id", http.StatusBadRequest)
		return
	}
	source, ok := formats[sourceID]
	if !ok {
		http.Error(w, "source driver not allowed", http.StatusBadRequest)
		return
	}
	target, ok := formats[targetID]
	if !ok || target.ReadOnly {
		http.Error(w, "target driver not allowed", http.StatusBadRequest)
		return
	}
	if source.Raster != target.Raster && sourceID != "gpkg" && targetID != "gpkg" {
		http.Error(w, "implicit raster/vector conversion is forbidden", http.StatusUnprocessableEntity)
		return
	}

	work, err := os.MkdirTemp("", "xulyvfm-"+reqID+"-")
	if err != nil {
		http.Error(w, "temp directory failed", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := os.RemoveAll(work); err != nil {
			log.Printf("request=%s cleanup_error=%v", reqID, err)
		}
	}()

	inputs, total, err := saveMultipart(r, filepath.Join(work, "in"))
	if err != nil {
		http.Error(w, "input rejected: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(inputs) == 0 {
		http.Error(w, "no input files", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Minute)
	defer cancel()

	inputPath, err := prepareInput(inputs, sourceID, work)
	if err != nil {
		http.Error(w, "input preparation failed: "+err.Error(), http.StatusBadRequest)
		return
	}
	outRoot := filepath.Join(work, "out")
	if err := os.MkdirAll(outRoot, 0o700); err != nil {
		http.Error(w, "output directory failed", 500)
		return
	}

	var inputFeatures int64
	if !source.Raster {
		inputFeatures, err = vectorFeatureCount(ctx, inputPath)
		if err != nil {
			http.Error(w, "input validation failed", http.StatusUnprocessableEntity)
			return
		}
	}

	var outputPath string
	if target.Multi {
		outputPath = filepath.Join(outRoot, "converted")
		if targetID == "gdb" {
			outputPath += ".gdb"
		}
	} else {
		outputPath = filepath.Join(outRoot, "converted."+target.Ext)
	}

	if source.Raster {
		err = runRaster(ctx, inputPath, outputPath, target, targetCRS)
	} else {
		err = runVector(ctx, inputPath, outputPath, source, target, sourceCRS, targetCRS)
	}
	if err != nil {
		log.Printf("request=%s conversion_error=%v", reqID, err)
		http.Error(w, "conversion failed", http.StatusUnprocessableEntity)
		return
	}

	if err := validateOutput(ctx, outputPath, target); err != nil {
		log.Printf("request=%s validation_error=%v", reqID, err)
		http.Error(w, "output validation failed", http.StatusUnprocessableEntity)
		return
	}

	var outputFeatures int64
	if !target.Raster {
		outputFeatures, err = vectorFeatureCount(ctx, outputPath)
		if err != nil {
			http.Error(w, "output feature-count validation failed", http.StatusUnprocessableEntity)
			return
		}
		if inputFeatures != outputFeatures {
			log.Printf("request=%s feature_count_mismatch input=%d output=%d", reqID, inputFeatures, outputFeatures)
			http.Error(w, "quality gate failed: feature count changed", http.StatusUnprocessableEntity)
			return
		}
	}

	finalPath := outputPath
	downloadName := "converted." + target.Ext
	if target.Multi || isDir(outputPath) {
		finalPath = filepath.Join(work, "converted-"+targetID+".zip")
		if err := zipPath(finalPath, outputPath); err != nil {
			http.Error(w, "zip output failed", 500)
			return
		}
		downloadName = "converted-" + targetID + ".zip"
	}

	stat, err := os.Stat(finalPath)
	if err != nil {
		http.Error(w, "output missing", 500)
		return
	}

	meta := manifest{
		RequestID: reqID, Source: sourceID, Target: targetID,
		SourceCRS: sourceCRS, TargetCRS: targetCRS,
		InputFiles: baseNames(inputs), InputBytes: total,
		OutputBytes: stat.Size(), DurationMS: time.Since(start).Milliseconds(),
		Validation: "reopen-ok+feature-count", OutputFile: downloadName,
		InputFeatures: inputFeatures, OutputFeatures: outputFeatures, BackendRetained: false,
	}
	metaJSON, _ := json.Marshal(meta)

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, downloadName))
	w.Header().Set("X-XulyVFM-Manifest", string(metaJSON))
	w.Header().Set("Cache-Control", "no-store, private")
	w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
	f, err := os.Open(finalPath)
	if err != nil {
		http.Error(w, "output open failed", 500)
		return
	}
	defer f.Close()
	_, _ = io.Copy(w, f)
	log.Printf("request=%s source=%s target=%s in=%d out=%d ms=%d retained=false", reqID, sourceID, targetID, total, stat.Size(), time.Since(start).Milliseconds())
}

func saveMultipart(r *http.Request, dir string) ([]string, int64, error) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		return nil, 0, errors.New("multipart/form-data required")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, 0, err
	}
	mr, err := r.MultipartReader()
	if err != nil {
		return nil, 0, err
	}
	var paths []string
	var total int64
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, total, err
		}
		if part.FileName() == "" {
			continue
		}
		name := filepath.Base(part.FileName())
		if name == "." || name == "" {
			return nil, total, errors.New("invalid filename")
		}
		p := filepath.Join(dir, name)
		f, err := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err != nil {
			return nil, total, err
		}
		n, copyErr := io.CopyBuffer(f, part, make([]byte, 1<<20))
		closeErr := f.Close()
		if copyErr != nil {
			return nil, total, copyErr
		}
		if closeErr != nil {
			return nil, total, closeErr
		}
		total += n
		if total > 100_000_000 {
			return nil, total, errors.New("input exceeds container safety limit")
		}
		paths = append(paths, p)
	}
	r.MultipartForm = &multipart.Form{Value: map[string][]string{}, File: map[string][]*multipart.FileHeader{}}
	_ = maxMemory
	return paths, total, nil
}

func prepareInput(paths []string, id, work string) (string, error) {
	if id != "gdb" {
		return choosePrimary(paths, id), nil
	}
	gdbDir := filepath.Join(work, "source.gdb")
	if err := os.MkdirAll(gdbDir, 0o700); err != nil {
		return "", err
	}
	if len(paths) == 1 && strings.EqualFold(filepath.Ext(paths[0]), ".zip") {
		if err := unzipGDB(paths[0], gdbDir); err != nil {
			return "", err
		}
		return gdbDir, nil
	}
	for _, p := range paths {
		dst := filepath.Join(gdbDir, filepath.Base(p))
		if err := copyFile(p, dst); err != nil {
			return "", err
		}
	}
	return gdbDir, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func unzipGDB(zipPath, dst string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, zf := range zr.File {
		if zf.FileInfo().IsDir() {
			continue
		}
		name := filepath.Clean(zf.Name)
		if strings.Contains(name, "..") {
			return errors.New("unsafe zip path")
		}
		base := filepath.Base(name)
		if base == "." || base == "" {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(filepath.Join(dst, base), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		closeErr := out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func choosePrimary(paths []string, id string) string {
	want := "." + id
	if id == "shp" || id == "tif" || id == "gml" || id == "gpx" || id == "dxf" || id == "dgn" || id == "mif" || id == "tab" || id == "gpkg" || id == "sqlite" || id == "geojson" || id == "csv" {
		for _, p := range paths {
			if strings.EqualFold(filepath.Ext(p), want) || (id == "tif" && strings.EqualFold(filepath.Ext(p), ".tiff")) {
				return p
			}
		}
	}
	return paths[0]
}

func runVector(ctx context.Context, input, output string, source, target formatSpec, sourceCRS, targetCRS string) error {
	args := []string{"-f", target.Driver}
	if source.Driver != "" {
		args = append(args, "-if", source.Driver)
	}
	if sourceCRS != "" && sourceCRS != "AUTO" && sourceCRS != "KEEP" {
		args = append(args, "-s_srs", sourceCRS)
	}
	if targetCRS != "" && targetCRS != "AUTO" && targetCRS != "KEEP" {
		args = append(args, "-t_srs", targetCRS)
	}
	switch target.Driver {
	case "CSV":
		args = append(args, "-lco", "GEOMETRY=AS_WKT")
	case "ESRI Shapefile":
		args = append(args, "-lco", "ENCODING=UTF-8")
	case "GeoJSON":
		args = append(args, "-lco", "RFC7946=YES")
	case "GPKG":
		args = append(args, "-lco", "SPATIAL_INDEX=YES")
	}
	if target.Ext == "mif" {
		args = append(args, "-lco", "FORMAT=MIF")
	}
	args = append(args, output, input)
	return command(ctx, "ogr2ogr", args...)
}

func runRaster(ctx context.Context, input, output string, target formatSpec, targetCRS string) error {
	common := []string{"-of", target.Driver}
	if target.Driver == "GTiff" {
		common = append(common, "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE", "-co", "BIGTIFF=IF_SAFER", "-co", "NUM_THREADS=ALL_CPUS")
	}
	if targetCRS != "" && targetCRS != "AUTO" && targetCRS != "KEEP" {
		args := append(common, "-t_srs", targetCRS, input, output)
		return command(ctx, "gdalwarp", args...)
	}
	args := append(common, input, output)
	return command(ctx, "gdal_translate", args...)
}

func vectorFeatureCount(ctx context.Context, dataset string) (int64, error) {
	cmd := exec.CommandContext(ctx, "ogrinfo", "-ro", "-so", "-al", dataset)
	cmd.Env = append(os.Environ(), "GDAL_VRT_ENABLE_PYTHON=NO", "CPL_DEBUG=OFF")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0, fmt.Errorf("ogrinfo count failed: %w", err)
	}
	return parseFeatureCount(string(out))
}

func parseFeatureCount(text string) (int64, error) {
	re := regexp.MustCompile(`Feature Count:\s*([0-9]+)`)
	matches := re.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return 0, errors.New("feature count unavailable")
	}
	var total int64
	for _, m := range matches {
		n, err := strconv.ParseInt(m[1], 10, 64)
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}

func validateOutput(ctx context.Context, output string, target formatSpec) error {
	if target.Raster {
		return command(ctx, "gdalinfo", "-json", output)
	}
	return command(ctx, "ogrinfo", "-ro", "-so", "-al", output)
}

func command(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(),
		"GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR",
		"GDAL_VRT_ENABLE_PYTHON=NO",
		"CPL_DEBUG=OFF",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		s := string(out)
		if len(s) > 2048 {
			s = s[len(s)-2048:]
		}
		return fmt.Errorf("%s failed: %w: %s", name, err, s)
	}
	return nil
}

func cleanCRS(s string) string {
	s = strings.TrimSpace(strings.ToUpper(s))
	if s == "" || s == "AUTO" || s == "KEEP" {
		return s
	}
	if regexp.MustCompile(`^EPSG:[0-9]{3,6}$`).MatchString(s) {
		return s
	}
	return ""
}

func baseNames(paths []string) []string {
	out := make([]string, len(paths))
	for i, p := range paths {
		out[i] = filepath.Base(p)
	}
	return out
}

func isDir(path string) bool {
	s, err := os.Stat(path)
	return err == nil && s.IsDir()
}

func zipPath(dst, src string) error {
	zf, err := os.Create(dst)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(zf)
	err = filepath.Walk(src, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(filepath.Dir(src), path)
		if err != nil {
			return err
		}
		w, err := zw.Create(filepath.ToSlash(rel))
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	})
	closeErr := zw.Close()
	fileErr := zf.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return fileErr
}
