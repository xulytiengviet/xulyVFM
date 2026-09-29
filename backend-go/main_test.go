package main

import "testing"

func TestParseFeatureCount(t *testing.T) {
	got, err := parseFeatureCount("Layer name: a\nFeature Count: 12\nLayer name: b\nFeature Count: 8\n")
	if err != nil {
		t.Fatal(err)
	}
	if got != 20 {
		t.Fatalf("got %d want 20", got)
	}
}

func TestParseFeatureCountMissing(t *testing.T) {
	if _, err := parseFeatureCount("no count here"); err == nil {
		t.Fatal("expected error")
	}
}

func TestCleanCRS(t *testing.T) {
	cases := map[string]string{
		"epsg:4326": "EPSG:4326",
		"EPSG:4756": "EPSG:4756",
		"AUTO": "AUTO",
		"KEEP": "KEEP",
		"+proj=tmerc": "",
		"EPSG:abc": "",
	}
	for in,want := range cases {
		if got:=cleanCRS(in); got!=want {
			t.Fatalf("cleanCRS(%q)=%q want %q",in,got,want)
		}
	}
}
