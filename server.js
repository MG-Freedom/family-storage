const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
fs.mkdirSync(path.join(root, 'photos'), {recursive:true});
const db = new DatabaseSync(path.join(root, 'storage.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,name TEXT NOT NULL,box INTEGER NOT NULL,note TEXT NOT NULL,photo TEXT NOT NULL,created TEXT NOT NULL); CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,name TEXT NOT NULL,box INTEGER NOT NULL,time TEXT NOT NULL);`);
const password = process.env.APP_PASSWORD;
if (!password || password.length < 8) throw new Error('请设置至少 8 位的 APP_PASSWORD 环境变量');
function send(res, status, data) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function equal(a,b){const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y);}
function body(req){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>16*1024*1024){reject(new Error('照片过大，请选择 10MB 以内的照片'));req.destroy();}else chunks.push(c);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(new Error('请求格式错误'));}});req.on('error',reject);});}
const server = http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 const auth=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64').toString();
 if(!equal(auth,`admin:${password}`)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Family Storage", charset="UTF-8"'});return res.end('Authentication required');}
 if(['POST','DELETE'].includes(req.method) && req.headers['x-storage-request']!=='1') return send(res,403,{error:'无效请求'});
 const url=new URL(req.url,'http://localhost');
 try {
  if(req.method==='GET' && url.pathname==='/api/items') return send(res,200,db.prepare('SELECT * FROM items ORDER BY created DESC').all());
  if(req.method==='GET' && url.pathname==='/api/logs') return send(res,200,db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 500').all());
  if(req.method==='POST' && url.pathname==='/api/items'){
   const b=await body(req);const name=String(b.name||'').trim(),note=String(b.note||'').trim(),box=Number(b.box);
   if(!name||name.length>100||note.length>1000||!Number.isSafeInteger(box)||box<1||box>999999) return send(res,400,{error:'请填写物品名称（最多100字）及有效箱号（1–999999）'});
   const m=String(b.photo||'').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
   if(!m)return send(res,400,{error:'请上传 JPG、PNG 或 WebP 照片'});
   const bytes=Buffer.from(m[2],'base64');
   const valid=(m[1]==='jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(m[1]==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(m[1]==='webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
   if(!valid||bytes.length>10*1024*1024)return send(res,400,{error:'图片无效或超过10MB'});
   const item={id:crypto.randomUUID(),name,box,note,created:new Date().toISOString()};item.photo=item.id+'.'+m[1];
   const file=path.join(root,'photos',item.photo);fs.writeFileSync(file,bytes);
   try{db.exec('BEGIN');db.prepare('INSERT INTO items VALUES(?,?,?,?,?,?)').run(item.id,name,box,note,item.photo,item.created);db.prepare('INSERT INTO logs(action,name,box,time) VALUES(?,?,?,?)').run('入库',name,box,item.created);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');fs.unlinkSync(file);throw e;}
   return send(res,201,item);
  }
  if(req.method==='DELETE' && /^\/api\/items\/[a-f0-9-]+$/.test(url.pathname)){
   const item=db.prepare('SELECT * FROM items WHERE id=?').get(url.pathname.split('/').pop());if(!item)return send(res,404,{error:'物品不存在或已取出'});
   try{db.exec('BEGIN');db.prepare('DELETE FROM items WHERE id=?').run(item.id);db.prepare('INSERT INTO logs(action,name,box,time) VALUES(?,?,?,?)').run('取出',item.name,item.box,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   try{fs.unlinkSync(path.join(root,'photos',item.photo));}catch(e){console.error('照片清理失败',e.message);}return send(res,200,{ok:true});
  }
  if(req.method==='GET'&& /^\/photos\/[a-f0-9-]+\.(jpeg|png|webp)$/.test(url.pathname)){
   const file=path.join(root,'photos',path.basename(url.pathname));if(!fs.existsSync(file))return send(res,404,{error:'照片不存在'});res.writeHead(200,{'Content-Type':'image/'+path.extname(file).slice(1),'Cache-Control':'private, max-age=3600'});return fs.createReadStream(file).pipe(res);
  }
  if(req.method==='GET' && url.pathname==='/manifest.webmanifest'){res.writeHead(200,{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'no-cache'});return res.end(fs.readFileSync(path.join(__dirname,'public/manifest.webmanifest')));}
  if(req.method==='GET' && url.pathname==='/icon.png'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'});return fs.createReadStream(path.join(__dirname,'public/icon.png')).pipe(res);}
  if(req.method==='GET' && url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"});return res.end(fs.readFileSync(path.join(__dirname,'public/index.html')));}
  send(res,404,{error:'页面不存在'});
 }catch(e){console.error(e);if(!res.headersSent)send(res,400,{error:'操作失败，请检查输入或稍后重试'});}
});
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('家庭仓库已启动，端口 '+(process.env.PORT||8080)));
function close(){server.close(()=>{db.close();process.exit(0);});}process.on('SIGTERM',close);process.on('SIGINT',close);
