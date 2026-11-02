const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');
test('认证、入库、搜索数据、日志、重启持久化和取出',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-storage-'));const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});let child;
 async function start(){child=spawn(process.execPath,['--experimental-sqlite','server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dir,APP_PASSWORD:'test-password-123'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('server exit '+code)));});}
 async function stop(){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 const request=(url,options={})=>fetch(`http://127.0.0.1:${port}${url}`,{...options,headers:{'Content-Type':'application/json','X-Storage-Request':'1',...options.headers}});
 try{await start();assert.equal((await fetch(`http://127.0.0.1:${port}/api/items`)).status,200);assert.equal((await request('/')).status,200);
 const payload={name:'冬季围巾',box:3,note:'蓝色',photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII='};
 assert.equal((await request('/api/items',{method:'POST',body:JSON.stringify({...payload,box:0})})).status,400);
 assert.equal((await request('/api/items',{method:'POST',headers:{'X-Storage-Request':''},body:JSON.stringify(payload)})).status,403);
 const added=await request('/api/items',{method:'POST',body:JSON.stringify(payload)});assert.equal(added.status,201);const item=await added.json();assert.equal((await request('/photos/'+item.photo)).status,200);assert.equal((await (await request('/api/items')).json())[0].name,'冬季围巾');
 await stop();await start();assert.equal((await (await request('/api/items')).json()).length,1);
 assert.equal((await request('/api/items/'+item.id,{method:'DELETE'})).status,200);assert.equal((await (await request('/api/items')).json()).length,0);assert.equal((await request('/photos/'+item.photo)).status,404);const logs=await (await request('/api/logs')).json();assert.deepEqual(logs.map(l=>l.action),['取出','入库']);assert.equal(logs[0].box,3);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
