(function(){
'use strict';
var META=window.HUB_META, CORE=window.HUB_CORE||[], DATA=CORE.slice();
var mcpLoaded=false;

// 紧凑记录字段位
var N=0,D=1,T=2,C=3,L=4,S=5,R=6,REPO=7,PATH=8,STAR=9,MEN=10,FL=11,TG=12,URL=13,FAM=14,TIER=15,SPEC=16;
var F_DUP=1,F_NEAR=2,F_FAMILY=4,F_REC=8;

var $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var fmt=function(n){return n==null||n<0?'—':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'k':String(n)};

// ---- 主题
var root=document.documentElement;
var saved=localStorage.getItem('hub-theme');
if(saved) root.setAttribute('data-theme',saved);
$('#theme').onclick=function(){
  var cur=root.getAttribute('data-theme');
  var next=cur==='dark'?'light':cur==='light'?'dark':(matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
  root.setAttribute('data-theme',next); localStorage.setItem('hub-theme',next);
};

// ---- 状态
var state={q:'',sort:'score',types:new Set(),cats:new Set(),langs:new Set(),risks:new Set(),
           onlyRec:false,hideDup:true,hideFamily:false,shown:60};

// ---- 数据加载:MCP 分片后台补,先渲染核心
function loadMcp(cb){
  if(mcpLoaded) return cb&&cb();
  var s=document.createElement('script'); s.src='data/mcp.js';
  s.onload=function(){ mcpLoaded=true; DATA=CORE.concat(window.HUB_MCP||[]); buildFilters(); render(); cb&&cb(); };
  s.onerror=function(){ mcpLoaded=true; cb&&cb(); };
  document.head.appendChild(s);
}

// ---- 搜索
function tokens(q){return q.toLowerCase().split(/\s+/).filter(Boolean)}
function match(r,tk){
  if(!tk.length) return true;
  var hay=(r[N]+' '+r[D]+' '+r[REPO]+' '+r[PATH]).toLowerCase();
  for(var i=0;i<tk.length;i++) if(hay.indexOf(tk[i])<0) return false;
  return true;
}

var SORTS=[
  {k:'score', label:'质量分',   f:function(a,b){return b[S]-a[S]||b[MEN]-a[MEN]}},
  {k:'curated',label:'策展交叉命中',f:function(a,b){return b[MEN]-a[MEN]||b[S]-a[S]}},
  {k:'stars', label:'仓库热度', f:function(a,b){return b[STAR]-a[STAR]||b[S]-a[S]}},
  {k:'risk',  label:'风险优先', f:function(a,b){return b[R]-a[R]||b[S]-a[S]}},
  {k:'name',  label:'名称',     f:function(a,b){return a[N].localeCompare(b[N])}}
];

function filtered(){
  var tk=tokens(state.q), out=[];
  for(var i=0;i<DATA.length;i++){
    var r=DATA[i];
    if(state.hideDup && (r[FL]&F_DUP || r[FL]&F_NEAR)) continue;
    if(state.hideFamily && (r[FL]&F_FAMILY)) continue;
    if(state.onlyRec && !(r[FL]&F_REC)) continue;
    if(state.types.size && !state.types.has(r[T])) continue;
    if(state.langs.size && !state.langs.has(r[L])) continue;
    if(state.risks.size && !state.risks.has(r[R])) continue;
    if(state.cats.size){
      var hit=false; for(var j=0;j<r[C].length;j++) if(state.cats.has(r[C][j])){hit=true;break}
      if(!hit) continue;
    }
    if(!match(r,tk)) continue;
    out.push(r);
  }
  var s=SORTS.filter(function(x){return x.k===state.sort})[0];
  out.sort(s.f);
  return out;
}

// ---- 渲染
var current=[];
function typeTag(ti){var t=META.types[ti];return '<span class="tag t-'+t.key+'">'+esc(t.zh)+'</span>'}
function riskTag(ri){var lv=META.risks[ri];return lv==='clean'||lv==='unscanned'?'':'<span class="tag r-'+lv+'">'+esc(lv)+'</span>'}

function rowHTML(r,rank){
  var tags=typeTag(r[T]);
  if(META.langs[r[L]]==='zh') tags+='<span class="tag zh">中文</span>';
  if(r[FL]&F_REC) tags+='<span class="tag rec">推荐</span>';
  if(r[FL]&F_DUP) tags+='<span class="tag dup">精确副本</span>';
  else if(r[FL]&F_NEAR) tags+='<span class="tag dup">跨仓搬运</span>';
  else if(r[FL]&F_FAMILY) tags+='<span class="tag dup">模板批量 ×'+r[FAM]+'</span>';
  tags+=riskTag(r[R]);
  return '<div class="row" data-i="'+rank+'">'
    +'<div class="rank">'+(rank+1)+'</div>'
    +'<div class="rmain"><div class="rtitle"><b>'+esc(r[N])+'</b>'+tags+'</div>'
    +'<div class="rdesc">'+esc(r[D]||'（无描述）')+'</div>'
    +'<div class="rrepo">'+esc(r[REPO])+(r[PATH]?' · '+esc(r[PATH]):'')+'</div></div>'
    +'<div class="rside"><span class="score">'+r[S]+'</span>'
    +'<span class="sub">★'+fmt(r[STAR])+'</span>'
    +(r[MEN]?'<span class="sub">策展 '+r[MEN]+'</span>':'')
    +'</div></div>';
}

function render(){
  current=filtered();
  $('#qcount').textContent=current.length.toLocaleString()+' / '+DATA.length.toLocaleString();
  var n=Math.min(state.shown,current.length);
  var html=''; for(var i=0;i<n;i++) html+=rowHTML(current[i],i);
  if(n<current.length) html+='<div class="more">已显示 '+n+' 条,继续滚动加载…</div>';
  $('#rows').innerHTML=html;
  $('#empty').hidden=current.length>0;
  paintFilterCounts();
}

// ---- 筛选器
function countBy(getter,size){
  var c=new Array(size).fill(0);
  for(var i=0;i<DATA.length;i++){
    var r=DATA[i];
    if(state.hideDup && (r[FL]&F_DUP||r[FL]&F_NEAR)) continue;
    var v=getter(r);
    if(Array.isArray(v)) v.forEach(function(x){if(x>=0)c[x]++}); else if(v>=0) c[v]++;
  }
  return c;
}
function group(title,items,set,key){
  var h='<div class="fgroup"><h4>'+esc(title)+'</h4>';
  items.forEach(function(it){
    h+='<label class="fitem'+(set.has(it.v)?' on':'')+'" data-k="'+key+'" data-v="'+it.v+'">'
      +'<input type="checkbox" '+(set.has(it.v)?'checked':'')+'><span>'+esc(it.label)+'</span>'
      +'<span class="n">'+(it.n==null?'':fmt(it.n))+'</span></label>';
  });
  return h+'</div>';
}
function buildFilters(){
  var tc=countBy(function(r){return r[T]},META.types.length);
  var cc=countBy(function(r){return r[C]},META.cats.length);
  var lc=countBy(function(r){return r[L]},META.langs.length);
  var rc=countBy(function(r){return r[R]},META.risks.length);

  var h='<div class="fgroup"><h4>视图</h4>'
    +'<label class="fitem'+(state.onlyRec?' on':'')+'" data-k="onlyRec"><input type="checkbox" '+(state.onlyRec?'checked':'')+'><span>只看推荐位</span></label>'
    +'<label class="fitem'+(state.hideDup?' on':'')+'" data-k="hideDup"><input type="checkbox" '+(state.hideDup?'checked':'')+'><span>隐藏重复副本</span></label>'
    +'<label class="fitem'+(state.hideFamily?' on':'')+'" data-k="hideFamily"><input type="checkbox" '+(state.hideFamily?'checked':'')+'><span>隐藏模板批量生成</span></label>'
    +'</div>';

  h+=group('类型',META.types.map(function(t,i){return {v:i,label:t.zh,n:tc[i]}}).filter(function(x){return x.n}),state.types,'types');
  h+=group('语言',META.langs.map(function(l,i){return {v:i,label:{en:'英文',zh:'中文',mixed:'中英混合',unknown:'未知'}[l]||l,n:lc[i]}}).filter(function(x){return x.n}),state.langs,'langs');
  h+=group('分类',META.cats.map(function(c,i){return {v:i,label:c.zh,n:cc[i]}}).filter(function(x){return x.n}).sort(function(a,b){return b.n-a.n}),state.cats,'cats');
  h+=group('风险',META.risks.map(function(r,i){return {v:i,label:r,n:rc[i]}}).filter(function(x){return x.n}),state.risks,'risks');
  h+='<button class="freset" id="freset">清空筛选</button>';
  $('#filters').innerHTML=h;
}
function paintFilterCounts(){}

$('#filters').addEventListener('click',function(e){
  var el=e.target.closest('.fitem');
  if(el){
    var k=el.dataset.k;
    if(k==='onlyRec'||k==='hideDup'||k==='hideFamily'){ state[k]=!state[k]; }
    else { var v=+el.dataset.v, set=state[k]; set.has(v)?set.delete(v):set.add(v); }
    state.shown=60; buildFilters(); render(); return;
  }
  if(e.target.id==='freset'){
    state.types.clear();state.cats.clear();state.langs.clear();state.risks.clear();
    state.onlyRec=false;state.hideDup=true;state.hideFamily=false;state.shown=60;
    buildFilters(); render();
  }
});

// ---- 排序条
$('#sorts').innerHTML=SORTS.map(function(s){return '<button data-k="'+s.k+'"'+(s.k===state.sort?' class="on"':'')+'>'+s.label+'</button>'}).join('');
$('#sorts').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b) return;
  state.sort=b.dataset.k; state.shown=60;
  [].forEach.call($('#sorts').children,function(x){x.classList.toggle('on',x.dataset.k===state.sort)});
  render();
});

// ---- 搜索输入
var timer;
$('#q').addEventListener('input',function(e){
  clearTimeout(timer);
  timer=setTimeout(function(){ state.q=e.target.value.trim(); state.shown=60; render(); },110);
});

// ---- 无限滚动
new IntersectionObserver(function(en){
  if(en[0].isIntersecting && state.shown<current.length){ state.shown+=60; render(); }
},{rootMargin:'600px'}).observe($('#sentinel'));

// ---- 详情抽屉
function installBlocks(r){
  var type=META.types[r[T]].key, name=r[N], repo=r[REPO], p=r[PATH];
  var dir=p.indexOf('/')>=0?p.replace(/\/[^/]*$/,''):'.';
  var out=[];
  if(type==='skill'){
    out.push(['克隆并安装到多端 (bash)',
      'git clone --depth 1 https://github.com/'+repo+' /tmp/hub-src\n'+
      'for D in ~/.claude/skills ~/.codex/skills ~/.agents/skills; do\n'+
      '  mkdir -p "$D" && cp -r /tmp/hub-src/'+dir+' "$D/'+name+'"\n'+
      'done']);
    out.push(['PowerShell',
      'git clone --depth 1 https://github.com/'+repo+' $env:TEMP\\hub-src\n'+
      "foreach ($D in @(\"$HOME\\.claude\\skills\",\"$HOME\\.codex\\skills\",\"$HOME\\.agents\\skills\")) {\n"+
      '  New-Item -ItemType Directory -Force $D | Out-Null\n'+
      '  Copy-Item -Recurse -Force "$env:TEMP\\hub-src\\'+dir.replace(/\//g,'\\')+'" "$D\\'+name+'"\n}']);
  } else if(type==='rules'){
    out.push(['放进项目规则目录',
      'mkdir -p .cursor/rules\n'+
      'curl -sSL https://raw.githubusercontent.com/'+repo+'/HEAD/'+p+' -o .cursor/rules/'+name+(/\.mdc$/.test(p)?'.mdc':'')]);
  } else if(type==='subagent'){
    out.push(['安装子代理','mkdir -p ~/.claude/agents\ncurl -sSL https://raw.githubusercontent.com/'+repo+'/HEAD/'+p+' -o ~/.claude/agents/'+name+'.md']);
  } else if(type==='command'){
    out.push(['安装斜杠命令','mkdir -p ~/.claude/commands\ncurl -sSL https://raw.githubusercontent.com/'+repo+'/HEAD/'+p+' -o ~/.claude/commands/'+name+'.md']);
  } else if(type==='plugin'){
    out.push(['在 Claude Code 内添加市场','/plugin marketplace add '+repo+'\n/plugin install '+name]);
  } else if(type==='mcp'){
    var sp=r[SPEC]||{};
    if(sp.u) out.push(['远程 MCP (streamable-http)','claude mcp add --transport http '+(sp.rn||name)+' '+sp.u]);
    if(sp.pk){
      var id=String(sp.pk).split(':')[1]||'';
      if(id) out.push(['本地 MCP (stdio)','claude mcp add '+(sp.rn||name)+' -- npx -y '+id]);
    }
    if(!sp.u && !sp.pk) out.push(['注册表条目','# 见官方 registry: '+(sp.rn||name)]);
  }
  return out;
}

function openDrawer(i){
  var r=current[i]; if(!r) return;
  var type=META.types[r[T]];
  var url=r[URL]||('https://github.com/'+r[REPO]+'/blob/HEAD/'+r[PATH]);
  var rk=META.risk[r[REPO]+' '+r[PATH]+' '+r[N]];

  var tags=typeTag(r[T])+riskTag(r[R]);
  if(META.langs[r[L]]==='zh') tags+='<span class="tag zh">中文</span>';
  if(r[FL]&F_REC) tags+='<span class="tag rec">推荐</span>';
  r[C].forEach(function(ci){ if(META.cats[ci]) tags+='<span class="tag">'+esc(META.cats[ci].zh)+'</span>' });

  var h='<button class="dclose" data-close>×</button>'
    +'<h2 class="dtitle">'+esc(r[N])+'</h2>'
    +'<div class="dmeta">'+esc(r[REPO])+(r[PATH]?' · '+esc(r[PATH]):'')+'</div>'
    +'<div class="dtags">'+tags+'</div>'
    +'<div class="dsec"><h3>描述</h3><p>'+esc(r[D]||'（该条目没有提供描述）')+'</p></div>'
    +'<div class="dsec"><h3>信号</h3><dl class="kv">'
      +'<dt>质量分</dt><dd>'+r[S]+' / 100</dd>'
      +'<dt>策展交叉命中</dt><dd>'+r[MEN]+'</dd>'
      +'<dt>仓库 star</dt><dd>'+fmt(r[STAR])+'</dd>'
      +'<dt>源层级</dt><dd>tier '+r[TIER]+'</dd>'
      +'<dt>可用端</dt><dd>'+(r[TG].map(function(t){return META.targets[t]}).join(', ')||'—')+'</dd>'
      +(r[FAM]?'<dt>模板族规模</dt><dd>'+r[FAM]+'</dd>':'')
      +'</dl></div>';

  var blocks=installBlocks(r);
  if(blocks.length){
    h+='<div class="dsec"><h3>安装</h3>';
    blocks.forEach(function(b){ h+='<p class="cmdlabel">'+esc(b[0])+'</p><pre class="cmd">'+esc(b[1])+'</pre>' });
    h+='</div>';
  }

  if(rk && rk.flags.length){
    h+='<div class="dsec"><h3>审计发现 · '+esc(rk.level)+' ('+rk.score+')</h3>';
    rk.flags.forEach(function(f){
      h+='<div class="flag"><div class="flag-h"><span class="tag r-'+esc(f.s)+'">'+esc(f.s)+'</span>'
        +'<b>'+esc(f.t)+'</b><span class="sub">L'+f.l+' · '+esc(f.w)+(f.f?' · 围栏内':'')+'</span></div>'
        +'<div class="flag-e">'+esc(f.e)+'</div></div>';
    });
    h+='<p class="cmdlabel">静态文本匹配基线,用于筛出需人工复核的条目,不构成终审判决。</p></div>';
  }

  h+='<div class="dsec"><a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener">在 GitHub 打开源文件 ↗</a></div>';

  $('#drawer-body').innerHTML=h;
  $('#drawer').hidden=false;
  document.body.style.overflow='hidden';
}
function closeDrawer(){ $('#drawer').hidden=true; document.body.style.overflow='' }
$('#rows').addEventListener('click',function(e){ var row=e.target.closest('.row'); if(row) openDrawer(+row.dataset.i) });
$('#drawer').addEventListener('click',function(e){ if(e.target.hasAttribute('data-close')) closeDrawer() });
addEventListener('keydown',function(e){ if(e.key==='Escape') closeDrawer(); if(e.key==='/'&&document.activeElement!==$('#q')){e.preventDefault();$('#q').focus()} });

// ---- 其它页面
function auditPage(){
  var rows=[];
  for(var k in META.risk){
    var parts=k.split(' '), v=META.risk[k];
    rows.push({repo:parts[0],path:parts[1],name:parts[2],level:v.level,score:v.score,flags:v.flags});
  }
  rows.sort(function(a,b){return b.score-a.score});
  var h='<h2 class="page">安全审计</h2><p class="pagesub">引擎 text-baseline · 静态文本匹配基线,筛出需人工复核项,不构成终审判决。共 '+rows.length+' 条被标记。</p><div class="tablewrap"><table class="data"><thead><tr><th>等级</th><th class="num">分</th><th>名称</th><th>来源</th><th>发现</th></tr></thead><tbody>';
  rows.forEach(function(r){
    h+='<tr><td><span class="tag r-'+esc(r.level)+'">'+esc(r.level)+'</span></td><td class="num">'+r.score+'</td>'
     +'<td>'+esc(r.name)+'</td><td><code>'+esc(r.repo)+'</code><br><span class="sub">'+esc(r.path)+'</span></td>'
     +'<td>'+r.flags.slice(0,4).map(function(f){return esc(f.t)+' <span class="sub">L'+f.l+(f.f?'·围栏':'')+'</span>'}).join('<br>')+'</td></tr>';
  });
  return h+'</tbody></table></div>';
}
function sourcesPage(){
  var h='<h2 class="page">数据源</h2><p class="pagesub">按产出条目数排序。role=curated-index 的源不抽内容,只贡献「策展交叉命中」投票信号。</p><div class="tablewrap"><table class="data"><thead><tr><th>仓库</th><th>层</th><th>角色</th><th>语言</th><th class="num">条目</th><th class="num">投票边</th><th class="num">★</th></tr></thead><tbody>';
  META.sources.forEach(function(s){
    h+='<tr><td><code>'+esc(s.repo)+'</code></td><td>t'+s.tier+'</td><td>'+esc(s.role||'')+'</td><td>'+esc(s.lang||'')+'</td>'
     +'<td class="num">'+s.entries+'</td><td class="num">'+(s.mentions||0)+'</td><td class="num">'+fmt(s.stars)+'</td></tr>';
  });
  return h+'</tbody></table></div>';
}
function statsPage(){
  var s=META.stats;
  var h='<h2 class="page">底表</h2><p class="pagesub">生成于 '+esc(s.generatedAt)+'</p>';
  h+='<div class="tablewrap"><table class="data"><tbody>'
    +'<tr><td>总条目</td><td class="num">'+s.total+'</td></tr>'
    +'<tr><td>canonical</td><td class="num">'+s.canonical+'</td></tr>'
    +'<tr><td>推荐位</td><td class="num">'+s.recommended+'</td></tr>'
    +'<tr><td>精确重复</td><td class="num">'+s.duplicates+'</td></tr>'
    +'<tr><td>跨仓搬运</td><td class="num">'+s.nearDuplicates+'</td></tr>'
    +'<tr><td>模板批量生成</td><td class="num">'+s.templateFamilyEntries+' 条 / '+s.templateFamilyGroups+' 族</td></tr>'
    +'<tr><td>冗余率</td><td class="num">'+s.dedupeRatio+'%</td></tr>'
    +'</tbody></table></div>';
  h+='<h2 class="page">按类型</h2><div class="tablewrap"><table class="data"><thead><tr><th>类型</th><th class="num">总数</th><th class="num">canonical</th></tr></thead><tbody>';
  META.types.forEach(function(t){ if(s.byType[t.key]) h+='<tr><td>'+esc(t.zh)+' <span class="sub">'+esc(t.en)+'</span></td><td class="num">'+s.byType[t.key]+'</td><td class="num">'+s.byTypeCanonical[t.key]+'</td></tr>' });
  h+='</tbody></table></div>';
  h+='<h2 class="page">按分类</h2><div class="tablewrap"><table class="data"><tbody>';
  Object.keys(s.byCategory).map(function(k){return [k,s.byCategory[k]]}).sort(function(a,b){return b[1]-a[1]}).forEach(function(kv){
    if(!kv[1]) return;
    var c=META.cats.filter(function(x){return x.key===kv[0]})[0]||{zh:kv[0]};
    h+='<tr><td>'+esc(c.zh)+'</td><td class="num">'+kv[1]+'</td></tr>';
  });
  return h+'</tbody></table></div>';
}

var VIEWS={list:'#view-list',audit:'#view-audit',sources:'#view-sources',stats:'#view-stats'};
function route(){
  var hash=(location.hash||'#/').replace('#/','')||'list';
  var name=VIEWS[hash]?hash:'list';
  Object.keys(VIEWS).forEach(function(k){ $(VIEWS[k]).hidden=(k!==name) });
  [].forEach.call(document.querySelectorAll('.nav a'),function(a){ a.classList.toggle('on',a.dataset.route===name) });
  if(name==='audit') $('#view-audit').innerHTML=auditPage();
  if(name==='sources') $('#view-sources').innerHTML=sourcesPage();
  if(name==='stats') $('#view-stats').innerHTML=statsPage();
  window.scrollTo(0,0);
}
addEventListener('hashchange',route);

// ---- 启动
$('#hero-total').textContent=META.stats.total.toLocaleString();
$('#hero-canon').textContent=META.stats.canonical.toLocaleString();
$('#hero-rec').textContent=META.stats.recommended.toLocaleString();
$('#hero-risk').textContent=Object.keys(META.risk).length.toLocaleString();
$('#hero-time').textContent='更新于 '+META.generatedAt.replace('T',' ').slice(0,16)+' UTC';
buildFilters(); render(); route(); loadMcp();
})();
