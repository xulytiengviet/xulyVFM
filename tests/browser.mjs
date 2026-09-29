import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=resolve('.'),dir=await mkdtemp(join(tmpdir(),'vfm-browser-'));
const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));if(!file.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.showSaveFilePicker=async()=>{throw new DOMException('The user aborted a request.','AbortError');};});await page.goto('http://127.0.0.1:'+server.address().port);
 const sample={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[105.905,10.274]},properties:{name:'Cầu Mỹ Thuận',nested:{note:'Vĩnh Long'}}}]};
 await page.locator('#fileInput').setInputFiles({name:'sample.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(sample))});await page.locator('#jobPanel').waitFor({state:'visible'});await page.selectOption('#targetFormat','geojson');
 async function download(selector,name){const pending=page.waitForEvent('download');await page.click(selector);const d=await pending;const path=join(dir,name);await d.saveAs(path);return path;}
 async function convert(){await page.click('#convertBtn');await page.waitForFunction(()=>!document.querySelector('#convertBtn').disabled);await page.locator('#resultPanel').waitFor({state:'visible'});}
 await convert();await page.click('#saveResultAs');assert.match(await page.locator('#resultStatus').innerText(),/Chưa lưu/);assert.equal(await page.locator('#modal').isVisible(),false);
 const normal=await download('#downloadResult','normal.geojson');assert.equal(JSON.parse(await readFile(normal,'utf8')).features[0].properties.name,'Cầu Mỹ Thuận');
 await page.selectOption('#outputMode','cvnss');await convert();const light=await download('#downloadResult','light.geojson');assert.equal(JSON.parse(await readFile(light,'utf8')).features[0].properties.name,'Caud Mis Thalf');
 await page.selectOption('#outputMode','signed');await page.fill('#ownerName','Test owner');await page.fill('#keyPassword','test-password-123456');await download('#createKey','test.vfmkey');await convert();const signed=await download('#downloadResult','test.vfms');
 await page.locator('#verifyInput').setInputFiles(signed);await page.waitForFunction(()=>!document.querySelector('#extractVerified').disabled);assert.match(await page.locator('#verifyStatus').innerText(),/CHƯA xác minh/);
 const extracted=await download('#extractVerified','extracted.geojson');assert.deepEqual(await readFile(extracted),await readFile(normal));
 const envelope=JSON.parse(await readFile(signed,'utf8'));await page.fill('#trustedFingerprint',envelope.manifest.keyFingerprint);await page.locator('#verifyInput').setInputFiles(signed);await page.waitForFunction(()=>!document.querySelector('#extractVerified').disabled);assert.match(await page.locator('#verifyStatus').innerText(),/khớp khóa tin cậy/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile horizontal overflow');
 await page.click('#clearResult');assert.equal(await page.locator('#resultPanel').isVisible(),false);assert.deepEqual(errors,[]);console.log('PASS browser: three downloads, signing key, verification, exact extraction, trusted key, mobile layout.');
}finally{await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
