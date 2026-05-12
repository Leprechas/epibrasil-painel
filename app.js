const DATA_URL="data/indicadores_municipio_ano.csv";
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat("pt-BR");
const fmt1=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1});
let DATA=[];

function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c==='"' && q && n==='"'){cell+='"'; i++}
    else if(c==='"'){q=!q}
    else if(c==="," && !q){row.push(cell); cell=""}
    else if((c==="\n"||c==="\r")&&!q){if(c==="\r"&&n==="\n")i++; row.push(cell); if(row.some(v=>v.trim()!==""))rows.push(row); row=[]; cell=""}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell); rows.push(row)}
  const head=rows.shift().map(x=>x.trim());
  return rows.map(r=>{const o={}; head.forEach((h,i)=>o[h]=(r[i]??"").trim()); return o});
}
function num(x){if(x===undefined||x===null||x==="")return null; const n=Number(String(x).replace(/\./g,"").replace(",", ".")); return Number.isFinite(n)?n:null}
function norm(r){
  const casos=num(r.casos)||0, pop=num(r.populacao);
  let inc=num(r.incidencia_100mil);
  if((inc===null||!Number.isFinite(inc)) && pop>0) inc=casos/pop*100000;
  return {doenca:(r.doenca||"").toUpperCase(),doenca_nome:r.doenca_nome||r.doenca,cod_mun6:String(r.cod_mun6||"").padStart(6,"0").slice(0,6),municipio:r.municipio||"",uf:(r.uf||"").toUpperCase(),ano:Number(r.ano),casos,populacao:pop,incidencia_100mil:inc};
}
function group(rows,keys){
  const m=new Map();
  for(const r of rows){
    const k=keys.map(x=>r[x]).join("|");
    if(!m.has(k)){const o={casos:0,populacao:0,_pop:0,_muns:new Set()};keys.forEach(x=>o[x]=r[x]);m.set(k,o)}
    const o=m.get(k); o.casos+=r.casos||0; if(Number.isFinite(r.populacao)){o.populacao+=r.populacao;o._pop++} if(r.cod_mun6)o._muns.add(r.cod_mun6);
  }
  return [...m.values()].map(o=>{const pop=o._pop?o.populacao:null;const inc=pop?o.casos/pop*100000:null;const muns=o._muns.size;delete o._pop;delete o._muns;return {...o,populacao:pop,incidencia_100mil:inc,municipios:muns}})
}
function setup(){
  const oldDisease=$("disease").value, oldYear=$("year").value;
  const diseases=[...new Map(DATA.map(r=>[r.doenca,r.doenca_nome])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"));
  $("disease").innerHTML=diseases.map(([c,n])=>`<option value="${c}">${n}</option>`).join("");
  if(diseases.some(([c])=>c===oldDisease)) $("disease").value=oldDisease;
  const d=$("disease").value;
  const years=[...new Set(DATA.filter(r=>r.doenca===d).map(r=>r.ano))].sort((a,b)=>a-b);
  $("year").innerHTML=years.map(y=>`<option>${y}</option>`).join("");
  $("year").value=years.includes(Number(oldYear))?oldYear:years.at(-1);
  const ufs=["",...[...new Set(DATA.filter(r=>r.doenca===d).map(r=>r.uf).filter(Boolean))].sort()];
  $("uf").innerHTML=ufs.map(u=>`<option value="${u}">${u||"Brasil"}</option>`).join("");
  updateMuns();
}
function updateMuns(){
  const d=$("disease").value, uf=$("uf").value;
  const muns=[...new Set(DATA.filter(r=>r.doenca===d&&(!uf||r.uf===uf)).map(r=>r.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  $("mun-list").innerHTML=muns.map(m=>`<option value="${m}"></option>`).join("");
}
function filtered(ignoreYear=false){
  const d=$("disease").value, y=Number($("year").value), uf=$("uf").value, mun=$("mun").value.trim();
  return DATA.filter(r=>r.doenca===d && (ignoreYear||r.ano===y) && (!uf||r.uf===uf) && (!mun||r.municipio===mun));
}
function refresh(){
  updateMuns();
  const rows=filtered(), total=group(rows,[])[0]||{casos:0,populacao:null,incidencia_100mil:null,municipios:0};
  $("card-casos").textContent=fmt.format(total.casos||0);
  $("card-pop").textContent=total.populacao?fmt.format(total.populacao):"—";
  $("card-inc").textContent=Number.isFinite(total.incidencia_100mil)?fmt1.format(total.incidencia_100mil):"—";
  $("card-muns").textContent=fmt.format(total.municipios||0);

  const ser=group(filtered(true),["ano"]).sort((a,b)=>a.ano-b.ano);
  Plotly.newPlot("series",[{x:ser.map(r=>r.ano),y:ser.map(r=>r.casos),type:"bar",name:"Casos"}],{margin:{t:20,r:20,b:45,l:60},yaxis:{title:"Casos"}},{responsive:true,displayModeBar:false});

  const ind=$("indicator").value;
  const ufRank=group(DATA.filter(r=>r.doenca===$("disease").value&&r.ano===Number($("year").value)),["uf"]).filter(r=>r.uf).sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity));
  Plotly.newPlot("ufs",[{x:ufRank.map(r=>r[ind]),y:ufRank.map(r=>r.uf),type:"bar",orientation:"h"}],{margin:{t:20,r:20,b:45,l:45},xaxis:{title:ind==="casos"?"Casos":"Incidência / 100 mil"}},{responsive:true,displayModeBar:false});

  const munRank=group(rows,["uf","cod_mun6","municipio"]).sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity)).slice(0,100);
  $("table").innerHTML="<thead><tr><th>UF</th><th>Código</th><th>Município</th><th>Casos</th><th>População</th><th>Incidência</th></tr></thead><tbody>"+munRank.map(r=>`<tr><td>${r.uf}</td><td>${r.cod_mun6}</td><td>${r.municipio}</td><td>${fmt.format(r.casos||0)}</td><td>${r.populacao?fmt.format(r.populacao):"—"}</td><td>${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}</td></tr>`).join("")+"</tbody>";
}
async function init(){
  const res=await fetch(DATA_URL); if(!res.ok) throw new Error("Arquivo de dados não encontrado");
  DATA=parseCSV(await res.text()).map(norm).filter(r=>r.doenca&&r.cod_mun6&&Number.isFinite(r.ano));
  $("row-count").textContent=`${fmt.format(DATA.length)} linhas`;
  setup(); refresh();
}
$("apply").onclick=refresh;
$("clear").onclick=()=>{$("uf").value="";$("mun").value="";refresh()};
$("uf").onchange=()=>{$("mun").value="";refresh()};
$("disease").onchange=()=>{setup();refresh()};
$("year").onchange=refresh;
$("indicator").onchange=refresh;
init().catch(e=>alert("Erro: "+e.message));
