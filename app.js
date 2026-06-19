const VERSION="20260619";
const MANIFEST_URL=`data/manifest.json?v=${VERSION}`;
const GEO_UF_URL=`data/ufs.geojson?v=${VERSION}`;
const GEO_MUN_URL=`data/municipios.geojson?v=${VERSION}`;
const POP_URL=`data/populacao_municipio_ano.csv?v=${VERSION}`;

const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat("pt-BR");
const fmt1=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1});
const fmt2=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2});

let MANIFEST=[];
let DATA=[];
let GEO_UF=null;
let GEO_MUN=null;
let POP_MAP=new Map();
let POP_SERIES=new Map();
let POP_NAME_SERIES=new Map();
let POP_NAME_ONLY_SERIES=new Map();
let MAP_UF=null;
let MAP_MUN=null;
let LAYER_UF=null;
let LAYER_MUN=null;
let MAP_BREAKS={uf:null,mun:null};

const CACHE={};
let fetchController=null;
let geoMunLoading=false;
let geoMunLoaded=false;

let TABLE_PAGE=0;
const TABLE_PAGE_SIZE=50;
let TABLE_ALL_ROWS=[];

const REGIONS={
  "Norte":["AC","AP","AM","PA","RO","RR","TO"],
  "Nordeste":["AL","BA","CE","MA","PB","PE","PI","RN","SE"],
  "Centro-Oeste":["DF","GO","MT","MS"],
  "Sudeste":["ES","MG","RJ","SP"],
  "Sul":["PR","RS","SC"]
};

const UF_BY_PREFIX={
  "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
  "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA",
  "31":"MG","32":"ES","33":"RJ","35":"SP",
  "41":"PR","42":"SC","43":"RS",
  "50":"MS","51":"MT","52":"GO","53":"DF"
};

const MAP_COLORS=["#fed7aa","#f97316","#ef4444","#b91c1c","#7f1d1d"];

// ── Utilities ──

function debounce(fn,ms){
  let timer;
  return function(...args){
    clearTimeout(timer);
    timer=setTimeout(()=>fn.apply(this,args),ms);
  };
}

function showLoading(){
  const bar=$("loading-bar");
  bar.classList.remove("done");
  bar.classList.add("active");
}

function hideLoading(){
  const bar=$("loading-bar");
  bar.classList.remove("active");
  bar.classList.add("done");
  setTimeout(()=>bar.classList.remove("done"),600);
}

function toast(message,type="info",duration=4000){
  const container=$("toast-container");
  const el=document.createElement("div");
  el.className=`toast toast-${type}`;
  el.textContent=message;
  container.appendChild(el);
  setTimeout(()=>{
    el.classList.add("leaving");
    el.addEventListener("animationend",()=>el.remove());
  },duration);
}

// ── Dark mode ──

function initTheme(){
  const saved=localStorage.getItem("epibrasil-theme");
  if(saved){
    document.documentElement.setAttribute("data-theme",saved);
  }else if(window.matchMedia("(prefers-color-scheme: dark)").matches){
    document.documentElement.setAttribute("data-theme","dark");
  }
}

function toggleTheme(){
  const current=document.documentElement.getAttribute("data-theme");
  const next=current==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",next);
  localStorage.setItem("epibrasil-theme",next);
  replotTheme();
}

function replotTheme(){
  if(typeof Plotly==="undefined")return;
  const t=getPlotlyTheme();
  const base={plot_bgcolor:t.bg,paper_bgcolor:t.paper,font:{color:t.font},"xaxis.color":t.font,"xaxis.gridcolor":t.grid,"yaxis.color":t.font,"yaxis.gridcolor":t.grid};
  try{Plotly.relayout("series",{...base,"yaxis2.color":t.font,"legend.font.color":t.font});}catch(e){}
  try{Plotly.relayout("ufs",base);}catch(e){}
  try{Plotly.relayout("compare-chart",{...base,"legend.font.color":t.font});}catch(e){}
  try{Plotly.relayout("region-chart",{...base,"legend.font.color":t.font});}catch(e){}
}

initTheme();

// ── URL state ──

function readURLState(){
  const params=new URLSearchParams(window.location.search);
  return {
    disease:params.get("doenca")||null,
    years:params.get("anos")?.split(",").map(Number).filter(Number.isFinite)||null,
    region:params.get("regiao")||null,
    uf:params.get("uf")||null,
    mun:params.get("municipio")||null,
    indicator:params.get("indicador")||null,
    mapClass:params.get("classificacao")||null
  };
}

function writeURLState(){
  const params=new URLSearchParams();

  const disease=$("disease")?.value;
  if(disease)params.set("doenca",disease);

  const years=selectedYears();
  if(years.length)params.set("anos",years.join(","));

  const region=$("region")?.value;
  if(region)params.set("regiao",region);

  const uf=$("uf")?.value;
  if(uf)params.set("uf",uf);

  const mun=$("mun")?.value?.trim();
  if(mun)params.set("municipio",mun);

  const indicator=$("indicator")?.value;
  if(indicator&&indicator!=="casos")params.set("indicador",indicator);

  const mapClass=$("map-class")?.value;
  if(mapClass&&mapClass!=="equal")params.set("classificacao",mapClass);

  const qs=params.toString();
  const url=qs?`${window.location.pathname}?${qs}`:window.location.pathname;
  history.replaceState(null,"",url);
}

// ── CSV parser ──

function parseCSV(text){
  const rows=[];
  let row=[];
  let cell="";
  let q=false;

  for(let i=0;i<text.length;i++){
    const c=text[i];
    const n=text[i+1];

    if(c==='"'&&q&&n==='"'){
      cell+='"';
      i++;
    }else if(c==='"'){
      q=!q;
    }else if(c===","&&!q){
      row.push(cell);
      cell="";
    }else if((c==="\n"||c==="\r")&&!q){
      if(c==="\r"&&n==="\n")i++;
      row.push(cell);
      if(row.some(v=>String(v).trim()!==""))rows.push(row);
      row=[];
      cell="";
    }else{
      cell+=c;
    }
  }

  if(cell||row.length){
    row.push(cell);
    rows.push(row);
  }

  const head=(rows.shift()||[]).map(x=>String(x).replace(/^﻿/,"").trim());
  return rows.map(r=>{
    const o={};
    head.forEach((h,i)=>o[h]=(r[i]??"").trim());
    return o;
  });
}

function num(x){
  if(x===undefined||x===null||x==="")return null;
  let s=String(x).trim();
  if(!s)return null;
  s=s.replace(/\s/g,"");

  if(s.includes(",")){
    s=s.replace(/\./g,"").replace(",",".");
  }else if(/^\d{1,3}(\.\d{3})+$/.test(s)){
    s=s.replace(/\./g,"");
  }

  const n=Number(s);
  return Number.isFinite(n)?n:null;
}

function normalizeText(s){
  return String(s||"")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g,"")
    .replace(/\s*-\s*[A-Z]{2}$/i,"")
    .replace(/[^a-zA-Z0-9]+/g," ")
    .trim()
    .toLowerCase();
}

// ── Population ──

function popKey(cod,ano){
  return String(cod).replace(/\D/g,"").padStart(6,"0").slice(0,6)+"|"+String(ano);
}

function popNameKey(municipio,uf){
  return normalizeText(municipio)+"|"+String(uf||"").toUpperCase();
}

function popNameOnlyKey(municipio){
  return normalizeText(municipio);
}

function ufFromCod(cod){
  cod=String(cod||"").replace(/\D/g,"").padStart(6,"0").slice(0,6);
  return UF_BY_PREFIX[cod.slice(0,2)]||"";
}

function addPopSerie(map,key,ano,pop){
  if(!key||!Number.isFinite(ano)||!Number.isFinite(pop)||pop<=0)return;
  if(!map.has(key))map.set(key,[]);
  map.get(key).push({ano,pop});
}

async function loadPopulation(){
  try{
    const res=await fetch(POP_URL);
    if(!res.ok){
      toast("Erro ao carregar dados de população","error");
      return;
    }

    const rows=parseCSV(await res.text());
    POP_MAP=new Map();
    POP_SERIES=new Map();
    POP_NAME_SERIES=new Map();
    POP_NAME_ONLY_SERIES=new Map();

    for(const r of rows){
      const rawCod=r.cod_mun6||r.cod_mun7||r.codigo_municipio||r.cod_municipio||r.CD_MUN||r.CD_GEOCMU||r.GEOCODIGO||r["Município (Código)"]||r["Municipio (Codigo)"]||r.D1C||"";
      const cod=String(rawCod||"").replace(/\D/g,"").padStart(6,"0").slice(0,6);
      const ano=Number(r.ano||r.Ano||r.ANO||r.year||r["Ano"]);
      const pop=num(r.populacao||r.População||r.Populacao||r.valor||r.Valor||r.V||r.value);

      if(!cod||!Number.isFinite(ano)||!Number.isFinite(pop)||pop<=0)continue;

      const municipioRaw=String(r.municipio_ibge||r.municipio||r.Município||r.Municipio||r["Município"]||r["Municipio"]||r.D1N||"").trim();
      const uf=String(r.uf||"").toUpperCase() ||
        (municipioRaw.match(/\s-\s([A-Z]{2})$/)?.[1] || "") ||
        ufFromCod(cod);
      const municipioLimpo=municipioRaw.replace(/\s-\s[A-Z]{2}$/," ").trim();

      POP_MAP.set(popKey(cod,ano),pop);
      addPopSerie(POP_SERIES,cod,ano,pop);

      if(municipioLimpo&&uf){
        addPopSerie(POP_NAME_SERIES,popNameKey(municipioLimpo,uf),ano,pop);
      }

      if(municipioLimpo){
        addPopSerie(POP_NAME_ONLY_SERIES,popNameOnlyKey(municipioLimpo),ano,pop);
      }
    }

    for(const serie of POP_SERIES.values())serie.sort((a,b)=>a.ano-b.ano);
    for(const serie of POP_NAME_SERIES.values())serie.sort((a,b)=>a.ano-b.ano);
    for(const serie of POP_NAME_ONLY_SERIES.values())serie.sort((a,b)=>a.ano-b.ano);
  }catch(e){
    toast("População não carregada: "+e.message,"warn");
  }
}

function estimatePopulationFromSerie(serie,ano){
  ano=Number(ano);
  if(!serie||serie.length===0||!Number.isFinite(ano))return {pop:null,estimated:false};

  const exact=serie.find(d=>d.ano===ano);
  if(exact&&Number.isFinite(exact.pop))return {pop:exact.pop,estimated:false};

  const before=serie.filter(d=>d.ano<ano).at(-1);
  const after=serie.find(d=>d.ano>ano);

  if(before&&after&&after.ano!==before.ano){
    const t=(ano-before.ano)/(after.ano-before.ano);
    return {pop:Math.round(before.pop+t*(after.pop-before.pop)),estimated:true};
  }

  if(before){
    const recent=serie.slice(-3);
    if(recent.length>=2){
      const first=recent[0];
      const last=recent[recent.length-1];

      if(first.pop>0&&last.pop>0&&last.ano!==first.ano){
        const taxa=Math.pow(last.pop/first.pop,1/(last.ano-first.ano))-1;
        const estimada=before.pop*Math.pow(1+taxa,ano-before.ano);

        if(Number.isFinite(estimada)&&estimada>0){
          return {pop:Math.round(estimada),estimated:true};
        }
      }
    }

    return {pop:before.pop,estimated:true};
  }

  if(after)return {pop:after.pop,estimated:true};

  return {pop:null,estimated:false};
}

function interpolatePopulation(cod,ano,municipio="",uf=""){
  cod=String(cod||"").replace(/\D/g,"").padStart(6,"0").slice(0,6);
  ano=Number(ano);

  if(!cod||!Number.isFinite(ano))return {pop:null,estimated:false};

  const exact=POP_MAP.get(popKey(cod,ano));
  if(Number.isFinite(exact))return {pop:exact,estimated:false};

  const byCode=estimatePopulationFromSerie(POP_SERIES.get(cod),ano);
  if(Number.isFinite(byCode.pop))return byCode;

  const byName=estimatePopulationFromSerie(POP_NAME_SERIES.get(popNameKey(municipio,uf)),ano);
  if(Number.isFinite(byName.pop))return byName;

  const byNameOnly=estimatePopulationFromSerie(POP_NAME_ONLY_SERIES.get(popNameOnlyKey(municipio)),ano);
  if(Number.isFinite(byNameOnly.pop))return byNameOnly;

  return {pop:null,estimated:false};
}

// ── Data normalization ──

function norm(r){
  const casos=num(r.casos)||0;
  const cod=String(r.cod_mun6||"").replace(/\D/g,"").padStart(6,"0").slice(0,6);
  const ano=Number(r.ano);
  const municipio=r.municipio||"";
  const uf=(r.uf||"").toUpperCase();

  let pop=num(r.populacao);
  let popEstimated=false;

  if(pop===null||!Number.isFinite(pop)||pop<=0){
    const estimated=interpolatePopulation(cod,ano,municipio,uf);
    pop=estimated.pop;
    popEstimated=estimated.estimated;
  }

  let inc=num(r.incidencia_100mil);
  if((inc===null||!Number.isFinite(inc))&&pop>0){
    inc=casos/pop*100000;
  }

  return{
    doenca:(r.doenca||"").toUpperCase(),
    doenca_nome:r.doenca_nome||r.doenca,
    cod_mun6:cod,
    municipio:municipio,
    uf:uf,
    ano:ano,
    casos:casos,
    populacao:pop,
    populacao_estimada:popEstimated,
    incidencia_100mil:inc
  };
}

function group(rows,keys){
  const m=new Map();

  for(const r of rows){
    const k=keys.map(x=>r[x]).join("|");

    if(!m.has(k)){
      const o={casos:0,populacao:0,_pop:0,_popEstimated:0,_muns:new Set(),_munsPos:new Set(),_ufsPos:new Set()};
      keys.forEach(x=>o[x]=r[x]);
      m.set(k,o);
    }

    const o=m.get(k);
    o.casos+=r.casos||0;

    if(Number.isFinite(r.populacao)&&r.populacao>0){
      o.populacao+=r.populacao;
      o._pop++;
      if(r.populacao_estimada)o._popEstimated++;
    }

    if(r.cod_mun6)o._muns.add(r.cod_mun6);
    if(r.cod_mun6&&(r.casos||0)>0)o._munsPos.add(r.cod_mun6);
    if(r.uf&&(r.casos||0)>0)o._ufsPos.add(r.uf);
  }

  return[...m.values()].map(o=>{
    const pop=o._pop?o.populacao:null;
    const inc=pop?o.casos/pop*100000:null;
    const municipios=o._muns.size;
    const municipios_com_notificacao=o._munsPos.size;
    const ufs_com_notificacao=o._ufsPos.size;
    const populacao_estimada=o._popEstimated>0;
    const pop_cobertura=municipios_com_notificacao?o._pop/municipios_com_notificacao*100:null;

    delete o._pop;
    delete o._popEstimated;
    delete o._muns;
    delete o._munsPos;
    delete o._ufsPos;

    return{...o,populacao:pop,incidencia_100mil:inc,municipios,municipios_com_notificacao,ufs_com_notificacao,populacao_estimada,pop_cobertura};
  });
}

// ── Filter helpers ──

function selectedYears(){
  return[...$("year").selectedOptions].map(o=>Number(o.value)).filter(Number.isFinite);
}

function setSelectedYears(years){
  const ys=new Set(years.map(Number));
  [...$("year").options].forEach(o=>{o.selected=ys.has(Number(o.value));});
}

function allAvailableYears(){
  return[...$("year").options].map(o=>Number(o.value)).filter(Number.isFinite);
}

function lepRegionOfUF(uf){
  uf=String(uf||"").toUpperCase();
  for(const [reg,ufs] of Object.entries(REGIONS)){
    if(ufs.includes(uf))return reg;
  }
  return "";
}

function yearsLabel(){
  const years=selectedYears().sort((a,b)=>a-b);
  if(years.length===0)return "Todos";
  if(years.length===1)return String(years[0]);
  const consecutive=years.every((y,i)=>i===0||y===years[i-1]+1);
  if(consecutive)return `${years[0]}–${years.at(-1)}`;
  return years.join(", ");
}

function diseaseLabel(){
  return $("disease")?.selectedOptions?.[0]?.textContent||"Doença selecionada";
}

function indicatorLabel(){
  const ind=$("indicator")?.value||"casos";
  return ind==="casos"?"Casos":"Incidência / 100 mil";
}

// ── Data loading with AbortController ──

async function loadDisease(code){
  if(CACHE[code]){
    DATA=CACHE[code];
    return;
  }

  if(fetchController)fetchController.abort();
  fetchController=new AbortController();

  const item=MANIFEST.find(d=>d.codigo===code);
  if(!item){
    toast("Doença não encontrada no manifesto","error");
    throw new Error("Doença não encontrada");
  }

  showLoading();
  $("row-count").textContent="carregando "+item.doenca+"...";

  try{
    const res=await fetch(item.arquivo+`?v=${VERSION}`,{signal:fetchController.signal});
    if(!res.ok){
      toast("Arquivo da doença não encontrado: "+item.arquivo,"error");
      throw new Error("Arquivo da doença não encontrado: "+item.arquivo);
    }

    DATA=parseCSV(await res.text()).map(norm).filter(r=>r.doenca&&r.cod_mun6&&Number.isFinite(r.ano));
    CACHE[code]=DATA;

    const totalLinhas=MANIFEST.reduce((a,b)=>a+(Number(b.linhas)||0),0);
    $("row-count").textContent=`${fmt.format(DATA.length)} linhas nesta doença | ${fmt.format(totalLinhas)} linhas no total | ${fmt.format(POP_MAP.size)} populações carregadas`;
    toast(`${item.doenca} carregada: ${fmt.format(DATA.length)} registros`,"success",2500);
  }catch(e){
    if(e.name==="AbortError")return;
    throw e;
  }finally{
    hideLoading();
  }
}

// ── Lazy GeoJSON municipal ──

async function ensureGeoMun(){
  if(GEO_MUN||geoMunLoaded)return;
  if(geoMunLoading)return;

  geoMunLoading=true;
  $("map-mun-status").textContent="carregando GeoJSON municipal...";

  try{
    const res=await fetch(GEO_MUN_URL);
    if(res.ok){
      GEO_MUN=await res.json();
      geoMunLoaded=true;
      toast("Mapa municipal carregado","success",2000);
    }else{
      toast("GeoJSON municipal não encontrado","warn");
    }
  }catch(e){
    toast("Erro ao carregar mapa municipal: "+e.message,"error");
  }finally{
    geoMunLoading=false;
  }
}

// ── Filter setup ──

function setupDiseaseSelect(){
  MANIFEST.sort((a,b)=>a.doenca.localeCompare(b.doenca,"pt-BR"));
  $("disease").innerHTML=MANIFEST.map(d=>`<option value="${d.codigo}">${d.doenca}</option>`).join("");
  populateCompareSelect();
}

function populateCompareSelect(){
  const el=$("compare");
  if(!el)return;
  const current=$("disease").value;
  el.innerHTML=MANIFEST.filter(d=>d.codigo!==current).map(d=>`<option value="${d.codigo}">${d.doenca}</option>`).join("");
}

function setupFilters(){
  const oldYears=selectedYears();
  const oldUf=$("uf").value;

  const years=[...new Set(DATA.map(r=>r.ano))].sort((a,b)=>a-b);
  const totalMuns=new Set(DATA.map(r=>r.cod_mun6)).size;
  const yearCoverage=new Map();
  for(const y of years){
    const munsInYear=new Set(DATA.filter(r=>r.ano===y&&(r.casos||0)>0).map(r=>r.cod_mun6)).size;
    yearCoverage.set(y,totalMuns>0?munsInYear/totalMuns:1);
  }
  $("year").innerHTML=years.map(y=>{
    const cov=yearCoverage.get(y)||0;
    const badge=cov<0.8?` ⚠ ${Math.round(cov*100)}%`:"";
    return `<option value="${y}" ${cov<0.8?'class="low-coverage"':''}>${y}${badge}</option>`;
  }).join("");

  const validOld=oldYears.filter(y=>years.includes(y));
  if(validOld.length>0)setSelectedYears(validOld);
  else if(years.length)setSelectedYears([years.at(-1)]);

  const region=$("region").value;
  const ufsDisponiveis=[...new Set(DATA.map(r=>r.uf).filter(Boolean))].sort();
  const ufsFiltradas=region?ufsDisponiveis.filter(uf=>lepRegionOfUF(uf)===region):ufsDisponiveis;
  const ufs=["",...ufsFiltradas];

  $("uf").innerHTML=ufs.map(u=>`<option value="${u}">${u||"Brasil"}</option>`).join("");
  if(ufs.includes(oldUf))$("uf").value=oldUf;
  else $("uf").value="";

  updateMuns();
}

function updateMuns(){
  const region=$("region").value;
  const uf=$("uf").value;
  const years=selectedYears();

  const muns=[...new Set(DATA.filter(r=>
    (years.length===0||years.includes(r.ano))&&
    (!region||lepRegionOfUF(r.uf)===region)&&
    (!uf||r.uf===uf)
  ).map(r=>r.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));

  $("mun-list").innerHTML=muns.map(m=>`<option value="${escapeHtml(m)}"></option>`).join("");
}

function filtered(ignoreYear=false){
  const years=selectedYears();
  const region=$("region").value;
  const uf=$("uf").value;
  const mun=$("mun").value.trim();

  return DATA.filter(r=>
    (ignoreYear||years.length===0||years.includes(r.ano))&&
    (!region||lepRegionOfUF(r.uf)===region)&&
    (!uf||r.uf===uf)&&
    (!mun||r.municipio===mun)
  );
}

function rowsForSelectedYearsNoGeoFilters(){
  const years=selectedYears();
  const region=$("region").value;

  return DATA.filter(r=>
    (years.length===0||years.includes(r.ano))&&
    (!region||lepRegionOfUF(r.uf)===region)
  );
}

// ── Map helpers ──

function getMunCode(f){
  const p=f.properties||{};
  const raw=p.cod_mun6||p.CD_MUN||p.CD_GEOCMU||p.GEOCODIGO||p.id||f.id||"";
  return String(raw).replace(/\D/g,"").padStart(7,"0").slice(0,6);
}

function getUFCode(f){
  const p=f.properties||{};
  return String(p.UF_05||p.uf||p.UF||p.sigla||p.SIGLA_UF||"").toUpperCase();
}

function makeBreaks(values,method){
  const vals=values.map(Number).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>a-b);
  if(vals.length===0)return null;

  const max=vals.at(-1);
  const min=vals[0];

  if(method==="quantile"){
    const q=p=>vals[Math.min(vals.length-1,Math.max(0,Math.floor((vals.length-1)*p)))];
    return [q(.2),q(.4),q(.6),q(.8),max];
  }

  if(method==="log"){
    const logMin=Math.log10(Math.max(min,1e-9));
    const logMax=Math.log10(Math.max(max,1e-9));
    const out=[];
    for(let i=1;i<=5;i++)out.push(Math.pow(10,logMin+(logMax-logMin)*i/5));
    return out;
  }

  return [max*.2,max*.4,max*.6,max*.8,max];
}

function colorFromBreaks(v,breaks){
  v=Number(v);
  if(!Number.isFinite(v)||v<=0||!breaks)return "#f1f5f9";
  if(v<=breaks[0])return MAP_COLORS[0];
  if(v<=breaks[1])return MAP_COLORS[1];
  if(v<=breaks[2])return MAP_COLORS[2];
  if(v<=breaks[3])return MAP_COLORS[3];
  return MAP_COLORS[4];
}

function prepareMapBreaks(rows){
  const ind=$("indicator").value;
  const method=$("map-class").value;
  const ufRows=group(rows,["uf"]).filter(r=>r.uf);
  const munRows=group(rows,["uf","cod_mun6","municipio"]);

  const ufValues=ufRows.map(r=>Number(r[ind]||0));
  const munValues=munRows.map(r=>Number(r[ind]||0));

  MAP_BREAKS={
    uf:{breaks:makeBreaks(ufValues,method),values:ufValues},
    mun:{breaks:makeBreaks(munValues,method),values:munValues}
  };
}

function colorForMap(v,kind){
  const breaks=MAP_BREAKS[kind]?.breaks;
  return colorFromBreaks(v,breaks);
}

function legendHTML(title,breaksObj){
  const method=$("map-class")?.selectedOptions?.[0]?.textContent||"Intervalos iguais";
  const ind=indicatorLabel();

  if(!breaksObj||!breaksObj.breaks){
    return `
      <strong>${title}</strong>
      <div style="margin-bottom:6px;color:var(--muted)">${ind}</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#f1f5f9"></span><span>Sem notificação</span></div>
    `;
  }

  const b=breaksObj.breaks;
  const rows=[
    {label:`${fmt1.format(b[3])} – ${fmt1.format(b[4])}`,color:MAP_COLORS[4]},
    {label:`${fmt1.format(b[2])} – ${fmt1.format(b[3])}`,color:MAP_COLORS[3]},
    {label:`${fmt1.format(b[1])} – ${fmt1.format(b[2])}`,color:MAP_COLORS[2]},
    {label:`${fmt1.format(b[0])} – ${fmt1.format(b[1])}`,color:MAP_COLORS[1]},
    {label:`> 0 – ${fmt1.format(b[0])}`,color:MAP_COLORS[0]},
    {label:"Sem notificação",color:"#f1f5f9"}
  ];

  return `
    <strong>${title}</strong>
    <div style="margin-bottom:6px;color:var(--muted)">${ind}</div>
    <div style="margin-bottom:6px;color:var(--muted)">Classificação: ${method}</div>
    ${rows.map(r=>`
      <div class="legend-row">
        <span class="legend-swatch" style="background:${r.color}"></span>
        <span>${r.label}</span>
      </div>
    `).join("")}
  `;
}

function updateLegends(){
  if($("legend-map-uf"))$("legend-map-uf").innerHTML=legendHTML("Legenda — UFs",MAP_BREAKS.uf);
  if($("legend-map-mun"))$("legend-map-mun").innerHTML=legendHTML("Legenda — municípios",MAP_BREAKS.mun);
}

// ── Map rendering ──

function getPlotlyTheme(){
  const dark=document.documentElement.getAttribute("data-theme")==="dark";
  return {
    bg:dark?"#1e293b":"#fff",
    paper:dark?"#1e293b":"#fff",
    font:dark?"#e2e8f0":"#111827",
    grid:dark?"#334155":"#e5e7eb"
  };
}

function initMaps(){
  if(typeof L==="undefined"){
    $("map-uf-status").textContent="Leaflet não carregou.";
    $("map-mun-status").textContent="Leaflet não carregou.";
    return false;
  }

  if(!MAP_UF){
    MAP_UF=L.map("map-uf",{scrollWheelZoom:false}).setView([-14.2,-51.9],4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(MAP_UF);
  }

  if(!MAP_MUN){
    MAP_MUN=L.map("map-mun",{scrollWheelZoom:false}).setView([-14.2,-51.9],4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(MAP_MUN);
  }

  return true;
}

async function renderMaps(rows){
  if(!initMaps())return;

  prepareMapBreaks(rows);

  const ind=$("indicator").value;

  if(LAYER_UF){
    LAYER_UF.remove();
    LAYER_UF=null;
  }

  if(LAYER_MUN){
    LAYER_MUN.remove();
    LAYER_MUN=null;
  }

  const ufRows=group(rows,["uf"]);
  const byUF=new Map(ufRows.map(r=>[r.uf,r]));

  if(GEO_UF){
    LAYER_UF=L.geoJSON(GEO_UF,{
      style:f=>{
        const sigla=getUFCode(f);
        const r=byUF.get(sigla);
        const v=r?Number(r[ind]||0):0;
        return{color:"#64748b",weight:.8,fillColor:colorForMap(v,"uf"),fillOpacity:r&&v>0?.78:.08};
      },
      onEachFeature:(f,l)=>{
        const p=f.properties||{};
        const sigla=getUFCode(f);
        const r=byUF.get(sigla);
        const nome=p.NOME_UF||sigla;
        if(r){
          l.bindPopup(`<strong>${escapeHtml(nome)} (${sigla})</strong><br>Casos no período: ${fmt.format(r.casos||0)}<br>População-ano: ${r.populacao?fmt.format(r.populacao):"—"}${r.populacao_estimada?" *":""}<br>Incidência: ${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}<br>Municípios com notificações: ${fmt.format(r.municipios_com_notificacao||0)}`);
        }else{
          l.bindPopup(`<strong>${escapeHtml(nome)} (${sigla})</strong><br>Sem notificação no filtro`);
        }
      }
    }).addTo(MAP_UF);

    try{MAP_UF.fitBounds(LAYER_UF.getBounds(),{padding:[15,15]});}catch(e){}
    $("map-uf-status").textContent="Mapa das UFs carregado";
  }else{
    $("map-uf-status").textContent="data/ufs.geojson não encontrado";
  }

  await ensureGeoMun();

  const munRows=group(rows,["uf","cod_mun6","municipio"]);
  const byCode=new Map(munRows.map(r=>[r.cod_mun6,r]));

  if(GEO_MUN){
    LAYER_MUN=L.geoJSON(GEO_MUN,{
      style:f=>{
        const code=getMunCode(f);
        const r=byCode.get(code);
        const v=r?Number(r[ind]||0):0;
        return{color:"#94a3b8",weight:.35,fillColor:colorForMap(v,"mun"),fillOpacity:r&&v>0?.78:.04};
      },
      onEachFeature:(f,l)=>{
        const code=getMunCode(f);
        const r=byCode.get(code);
        const name=(f.properties&&f.properties.name)||r?.municipio||code;
        if(r){
          l.bindPopup(`<strong>${escapeHtml(name)} - ${r.uf}</strong><br>Casos no período: ${fmt.format(r.casos||0)}<br>População-ano: ${r.populacao?fmt.format(r.populacao):"—"}${r.populacao_estimada?" *":""}<br>Incidência: ${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}`);
        }
      }
    }).addTo(MAP_MUN);

    try{MAP_MUN.fitBounds(LAYER_MUN.getBounds(),{padding:[15,15]});}catch(e){}
    $("map-mun-status").textContent="Mapa municipal carregado";
  }else{
    $("map-mun-status").textContent="data/municipios.geojson não encontrado";
  }

  updateLegends();
}

// ── Trend ──

function computeTrend(series){
  const ser=series.filter(r=>Number.isFinite(r.ano)).sort((a,b)=>a.ano-b.ano);
  if(ser.length<2)return "—";

  const first=ser[0].casos||0;
  const last=ser.at(-1).casos||0;

  if(first===0&&last>0)return "Emergente";
  if(first===0&&last===0)return "Estável";

  const delta=(last-first)/first*100;
  if(delta>10)return `Alta ${fmt1.format(delta)}%`;
  if(delta<-10)return `Queda ${fmt1.format(Math.abs(delta))}%`;
  return "Estável";
}

function updateSegmentedButtons(){
  const ind=$("indicator").value;
  document.querySelectorAll(".segmented button").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.indicator===ind);
  });
}

// ── Refresh ──

async function refresh(){
  updateMuns();
  updateSegmentedButtons();
  writeURLState();

  const rows=filtered();
  const total=group(rows,[])[0]||{casos:0,populacao:null,incidencia_100mil:null,municipios_com_notificacao:0,ufs_com_notificacao:0,pop_cobertura:null};

  $("card-casos").textContent=fmt.format(total.casos||0);
  $("card-pop").textContent=total.populacao?fmt.format(total.populacao)+(total.populacao_estimada?" *":""):"—";

  const nYears=selectedYears().length||new Set(rows.map(r=>r.ano).filter(Number.isFinite)).size||1;
  const popMedia=total.populacao&&nYears?total.populacao/nYears:null;
  if($("card-pop-media")){
    $("card-pop-media").textContent=popMedia?fmt.format(Math.round(popMedia))+(total.populacao_estimada?" *":""):"—";
  }

  $("card-inc").textContent=Number.isFinite(total.incidencia_100mil)?fmt1.format(total.incidencia_100mil):"—";
  $("card-muns").textContent=fmt.format(total.municipios_com_notificacao||0);
  $("card-periodo").textContent=yearsLabel();
  $("card-ufs").textContent=fmt.format(total.ufs_com_notificacao||0);
  $("card-cobertura").textContent=Number.isFinite(total.pop_cobertura)?`${fmt1.format(total.pop_cobertura)}%`:"—";

  const ser=group(rows,["ano"]).sort((a,b)=>a.ano-b.ano);
  $("card-tendencia").textContent=computeTrend(ser);

  renderSeriesChart(ser);
  renderUFRanking();
  renderRegionStackedChart(filtered(false));

  const incMin=num($("inc-min")?.value);
  const incMax=num($("inc-max")?.value);
  let mapTableRows=rows;
  if(Number.isFinite(incMin)||Number.isFinite(incMax)){
    const munGrouped=group(rows,["uf","cod_mun6","municipio"]);
    const validMuns=new Set(munGrouped.filter(r=>{
      const inc=r.incidencia_100mil;
      if(!Number.isFinite(inc))return false;
      if(Number.isFinite(incMin)&&inc<incMin)return false;
      if(Number.isFinite(incMax)&&inc>incMax)return false;
      return true;
    }).map(r=>r.cod_mun6));
    mapTableRows=rows.filter(r=>validMuns.has(r.cod_mun6));
  }

  renderMunicipalTable(mapTableRows);
  await renderMaps(mapTableRows);

  const comparisons=await loadComparisonDiseases();
  renderComparisonChart(comparisons);
}

const debouncedRefresh=debounce(()=>refresh(),300);

// ── Charts ──

function renderSeriesChart(ser){
  const el=$("series");

  if(typeof Plotly==="undefined"){
    el.innerHTML="<p class='subtle'>Plotly não carregou. Verifique a conexão ou a linha do script no index.html.</p>";
    return;
  }

  const theme=getPlotlyTheme();

  Plotly.newPlot("series",[
    {
      x:ser.map(r=>String(r.ano)),
      y:ser.map(r=>r.casos),
      type:"bar",
      name:"Casos",
      hovertemplate:"Ano: %{x}<br>Casos: %{y}<extra></extra>"
    },
    {
      x:ser.map(r=>String(r.ano)),
      y:ser.map(r=>Number.isFinite(r.incidencia_100mil)?r.incidencia_100mil:null),
      type:"scatter",
      mode:"lines+markers",
      name:"Incidência / 100 mil",
      yaxis:"y2",
      hovertemplate:"Ano: %{x}<br>Incidência: %{y:.1f}<extra></extra>"
    }
  ],{
    margin:{t:20,r:70,b:45,l:60},
    yaxis:{title:"Casos/Ano",color:theme.font,gridcolor:theme.grid},
    yaxis2:{title:"Incidência",overlaying:"y",side:"right",showgrid:false,color:theme.font},
    xaxis:{title:"Ano",type:"category",color:theme.font,gridcolor:theme.grid},
    legend:{orientation:"h",y:1.12,font:{color:theme.font}},
    plot_bgcolor:theme.bg,
    paper_bgcolor:theme.paper,
    font:{color:theme.font}
  },{responsive:true,displayModeBar:false});
}

function renderUFRanking(){
  const el=$("ufs");
  const ind=$("indicator").value;

  if(typeof Plotly==="undefined"){
    el.innerHTML="<p class='subtle'>Plotly não carregou.</p>";
    return;
  }

  const theme=getPlotlyTheme();

  const ufRank=group(rowsForSelectedYearsNoGeoFilters(),["uf"])
    .filter(r=>r.uf&&(r[ind]||0)>0)
    .sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity));

  Plotly.newPlot("ufs",[{
    x:ufRank.map(r=>r[ind]),
    y:ufRank.map(r=>r.uf),
    type:"bar",
    orientation:"h",
    text:ufRank.map(r=>ind==="casos"?fmt.format(r[ind]||0):fmt1.format(r[ind]||0)),
    textposition:"inside",
    insidetextanchor:"end",
    hovertemplate:"<b>%{y}</b><br>Valor: %{x}<extra></extra>"
  }],{
    margin:{t:20,r:30,b:50,l:60},
    height:520,
    xaxis:{title:ind==="casos"?"Casos no período":"Incidência / 100 mil",color:theme.font,gridcolor:theme.grid},
    yaxis:{automargin:true,categoryorder:"total ascending",color:theme.font},
    plot_bgcolor:theme.bg,
    paper_bgcolor:theme.paper,
    font:{color:theme.font}
  },{responsive:true,displayModeBar:false});
}

function renderRegionStackedChart(rows){
  const el=$("region-chart");
  const panel=$("region-panel");
  if(!el||!panel)return;

  if(typeof Plotly==="undefined"){
    el.innerHTML="<p class='subtle'>Plotly não carregou.</p>";
    return;
  }

  const theme=getPlotlyTheme();
  const ind=$("indicator").value;
  const regionColors={"Norte":"#0ea5e9","Nordeste":"#f97316","Centro-Oeste":"#a855f7","Sudeste":"#22c55e","Sul":"#ef4444"};

  const rowsWithRegion=rows.map(r=>({...r,_region:lepRegionOfUF(r.uf)})).filter(r=>r._region);
  const byYearRegion=new Map();
  for(const r of rowsWithRegion){
    const k=`${r.ano}|${r._region}`;
    if(!byYearRegion.has(k))byYearRegion.set(k,{ano:r.ano,region:r._region,casos:0,populacao:0,_pop:0});
    const o=byYearRegion.get(k);
    o.casos+=r.casos||0;
    if(Number.isFinite(r.populacao)&&r.populacao>0){o.populacao+=r.populacao;o._pop++;}
  }

  const grouped=[...byYearRegion.values()].map(o=>{
    const inc=o._pop&&o.populacao?o.casos/o.populacao*100000:null;
    return{...o,incidencia_100mil:inc};
  });

  const years=[...new Set(grouped.map(r=>r.ano))].sort((a,b)=>a-b);
  if(years.length<2){panel.style.display="none";return;}

  panel.style.display="";
  const traces=Object.keys(REGIONS).map(reg=>({
    x:years.map(String),
    y:years.map(y=>{const r=grouped.find(g=>g.ano===y&&g.region===reg);return r?r[ind]||0:0;}),
    name:reg,
    type:"bar",
    marker:{color:regionColors[reg]||"#999"},
    hovertemplate:`<b>${reg}</b><br>Ano: %{x}<br>${ind==="casos"?"Casos":"Incidência"}: %{y}<extra></extra>`
  }));

  Plotly.newPlot("region-chart",traces,{
    barmode:"stack",
    margin:{t:20,r:30,b:45,l:70},
    xaxis:{title:"Ano",type:"category",color:theme.font,gridcolor:theme.grid},
    yaxis:{title:ind==="casos"?"Casos":"Incidência / 100 mil",color:theme.font,gridcolor:theme.grid},
    legend:{orientation:"h",y:1.12,font:{color:theme.font}},
    plot_bgcolor:theme.bg,
    paper_bgcolor:theme.paper,
    font:{color:theme.font}
  },{responsive:true,displayModeBar:false});
}

function renderMunicipalTable(rows){
  const ind=$("indicator").value;
  TABLE_ALL_ROWS=group(rows,["uf","cod_mun6","municipio"])
    .filter(r=>(r[ind]||0)>0)
    .sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity));
  TABLE_PAGE=0;
  renderTablePage();
}

function renderTablePage(){
  const total=TABLE_ALL_ROWS.length;
  const totalPages=Math.max(1,Math.ceil(total/TABLE_PAGE_SIZE));
  if(TABLE_PAGE>=totalPages)TABLE_PAGE=totalPages-1;
  if(TABLE_PAGE<0)TABLE_PAGE=0;

  const start=TABLE_PAGE*TABLE_PAGE_SIZE;
  const page=TABLE_ALL_ROWS.slice(start,start+TABLE_PAGE_SIZE);

  $("table").innerHTML="<thead><tr><th>#</th><th>UF</th><th>Código</th><th>Município</th><th>Casos no período</th><th>População-ano somada</th><th>Incidência</th><th>Pop. estimada</th></tr></thead><tbody>"+
    page.map((r,i)=>`<tr><td>${start+i+1}</td><td>${r.uf}</td><td>${r.cod_mun6}</td><td>${escapeHtml(r.municipio)}</td><td>${fmt.format(r.casos||0)}</td><td>${r.populacao?fmt.format(r.populacao)+(r.populacao_estimada?" *":""):"—"}</td><td>${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}</td><td>${r.populacao_estimada?"Sim":"Não"}</td></tr>`).join("")+
    "</tbody>";

  const pag=$("table-pagination");
  if(pag){
    pag.innerHTML=`
      <button id="page-first" type="button" class="secondary mini" ${TABLE_PAGE===0?"disabled":""}>&#171;</button>
      <button id="page-prev" type="button" class="secondary mini" ${TABLE_PAGE===0?"disabled":""}>&#8249; Anterior</button>
      <span class="page-info">Página ${TABLE_PAGE+1} de ${totalPages} (${fmt.format(total)} municípios)</span>
      <button id="page-next" type="button" class="secondary mini" ${TABLE_PAGE>=totalPages-1?"disabled":""}>Próxima &#8250;</button>
      <button id="page-last" type="button" class="secondary mini" ${TABLE_PAGE>=totalPages-1?"disabled":""}>&#187;</button>
    `;
    $("page-first").onclick=()=>{TABLE_PAGE=0;renderTablePage();};
    $("page-prev").onclick=()=>{TABLE_PAGE--;renderTablePage();};
    $("page-next").onclick=()=>{TABLE_PAGE++;renderTablePage();};
    $("page-last").onclick=()=>{TABLE_PAGE=Math.ceil(total/TABLE_PAGE_SIZE)-1;renderTablePage();};
  }
}

// ── Comparison ──

async function loadComparisonDiseases(){
  const el=$("compare");
  if(!el)return [];
  const codes=[...el.selectedOptions].map(o=>o.value);
  if(codes.length===0)return [];

  toast(`Carregando ${codes.length} doença(s) para comparação...`,"info",2000);
  const results=[];
  for(const code of codes){
    if(CACHE[code]){
      results.push({code,data:CACHE[code],name:MANIFEST.find(d=>d.codigo===code)?.doenca||code});
      continue;
    }
    try{
      const item=MANIFEST.find(d=>d.codigo===code);
      if(!item)continue;
      const res=await fetch(item.arquivo+`?v=${VERSION}`);
      if(!res.ok){toast(`Erro ao carregar ${item.doenca}`,"warn");continue;}
      const data=parseCSV(await res.text()).map(norm).filter(r=>r.doenca&&r.cod_mun6&&Number.isFinite(r.ano));
      CACHE[code]=data;
      results.push({code,data,name:item.doenca});
    }catch(e){
      toast("Erro ao carregar doença para comparação","error");
    }
  }
  return results;
}

function renderComparisonChart(comparisons){
  const panel=$("compare-panel");
  const el=$("compare-chart");
  if(!panel||!el)return;

  if(!comparisons||comparisons.length===0){
    panel.style.display="none";
    return;
  }

  panel.style.display="";
  if(typeof Plotly==="undefined")return;

  const theme=getPlotlyTheme();
  const ind=$("indicator").value;
  const mainName=diseaseLabel();
  const colors=["#0ea5e9","#f97316","#22c55e","#a855f7","#ef4444","#eab308"];

  const region=$("region").value;
  const uf=$("uf").value;
  const mun=$("mun").value.trim();

  const mainAllYears=DATA.filter(r=>
    (!region||lepRegionOfUF(r.uf)===region)&&
    (!uf||r.uf===uf)&&
    (!mun||r.municipio===mun)
  );
  const mainSer=group(mainAllYears,["ano"]).sort((a,b)=>a.ano-b.ano);

  const traces=[{
    x:mainSer.map(r=>String(r.ano)),
    y:mainSer.map(r=>r[ind]||0),
    type:"scatter",mode:"lines+markers",
    name:mainName,
    line:{color:colors[0],width:3}
  }];

  comparisons.forEach((comp,i)=>{
    const filt=comp.data.filter(r=>
      (!region||lepRegionOfUF(r.uf)===region)&&
      (!uf||r.uf===uf)&&
      (!mun||r.municipio===mun)
    );
    const ser=group(filt,["ano"]).sort((a,b)=>a.ano-b.ano);
    traces.push({
      x:ser.map(r=>String(r.ano)),
      y:ser.map(r=>r[ind]||0),
      type:"scatter",mode:"lines+markers",
      name:comp.name,
      line:{color:colors[(i+1)%colors.length],width:2}
    });
  });

  Plotly.newPlot("compare-chart",traces,{
    margin:{t:20,r:30,b:45,l:60},
    xaxis:{title:"Ano",type:"category",color:theme.font,gridcolor:theme.grid},
    yaxis:{title:indicatorLabel(),color:theme.font,gridcolor:theme.grid},
    legend:{orientation:"h",y:1.12,font:{color:theme.font}},
    plot_bgcolor:theme.bg,paper_bgcolor:theme.paper,font:{color:theme.font}
  },{responsive:true,displayModeBar:false});
}

// ── Chart export ──

function downloadPlotlyChart(divId,label,title){
  if(typeof Plotly==="undefined")return;
  const disease=($("disease")?.value||"doenca").toLowerCase();
  const years=yearsLabel().replaceAll(" ","_").replaceAll(",","-").replaceAll("–","-");
  const filename=`leprechas_${label}_${disease}_${years}.png`;
  const theme=getPlotlyTheme();

  const src=document.getElementById(divId);
  if(!src||!src.data)return;

  const clone=document.createElement("div");
  clone.style.cssText="position:fixed;left:-9999px;top:0;width:1200px;height:700px;visibility:hidden";
  document.body.appendChild(clone);

  const exportLayout=JSON.parse(JSON.stringify(src.layout||{}));
  exportLayout.title={text:title,font:{size:18,color:theme.font,family:"Arial, sans-serif"},x:0.02,xanchor:"left"};
  exportLayout.margin={t:60,r:(exportLayout.margin||{}).r||70,b:90,l:(exportLayout.margin||{}).l||60};
  exportLayout.legend={orientation:"h",y:-0.06,x:0,xanchor:"left",font:{color:theme.font}};
  exportLayout.plot_bgcolor=theme.bg;
  exportLayout.paper_bgcolor=theme.paper;
  exportLayout.font={color:theme.font};

  Plotly.newPlot(clone,JSON.parse(JSON.stringify(src.data)),exportLayout,{staticPlot:true})
    .then(()=>Plotly.toImage(clone,{format:"png",width:1200,height:700}))
    .then(dataUrl=>{
      Plotly.purge(clone);
      clone.remove();
      const a=document.createElement("a");
      a.href=dataUrl;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Gráfico exportado","success",2000);
    })
    .catch(()=>{
      try{Plotly.purge(clone);}catch(e){}
      clone.remove();
      toast("Erro ao exportar gráfico","error");
    });
}

// ── Helpers ──

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function csvEscape(value){
  if(value===null||value===undefined)return "";
  const s=String(value);
  if(/[",\n\r;]/.test(s))return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function downloadText(content,filename,type){
  const blob=new Blob([content],{type:type||"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadFilteredCSV(){
  const rows=filtered();
  const headers=["doenca","doenca_nome","cod_mun6","municipio","uf","ano","casos","populacao","populacao_estimada","incidencia_100mil"];
  const csv=[
    headers.join(","),
    ...rows.map(r=>headers.map(h=>csvEscape(h==="incidencia_100mil"&&Number.isFinite(r[h])?r[h].toFixed(6):r[h])).join(","))
  ].join("\n");

  const disease=($("disease")?.value||"doenca").toLowerCase();
  const years=yearsLabel().replaceAll(" ","_").replaceAll(",","-").replaceAll("–","-");
  downloadText(csv,`leprechas_${disease}_${years}_filtrado.csv`,"text/csv;charset=utf-8");
}

// ── SVG export ──

function featureRings(geometry){
  if(!geometry)return [];
  if(geometry.type==="Polygon")return geometry.coordinates;
  if(geometry.type==="MultiPolygon")return geometry.coordinates.flat();
  return [];
}

function allCoords(features){
  const coords=[];
  for(const f of features){
    for(const ring of featureRings(f.geometry)){
      for(const c of ring){
        if(Array.isArray(c)&&c.length>=2)coords.push(c);
      }
    }
  }
  return coords;
}

function svgEscape(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function buildCleanMapSVG(kind){
  const isUF=kind==="uf";
  const geo=isUF?GEO_UF:GEO_MUN;

  if(!geo||!geo.features){
    toast("GeoJSON não carregado","warn");
    return null;
  }

  const rows=filtered();
  const ind=$("indicator").value;
  const grouped=isUF?group(rows,["uf"]):group(rows,["uf","cod_mun6","municipio"]);
  const values=grouped.map(r=>Number(r[ind]||0));
  const method=$("map-class").value;
  const breaks=makeBreaks(values,method);
  const byKey=new Map(grouped.map(r=>[isUF?r.uf:r.cod_mun6,r]));

  const features=geo.features;
  const coords=allCoords(features);

  if(coords.length===0){
    toast("Coordenadas do mapa não encontradas","warn");
    return null;
  }

  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const c of coords){
    if(c[0]<minX)minX=c[0];
    if(c[0]>maxX)maxX=c[0];
    if(c[1]<minY)minY=c[1];
    if(c[1]>maxY)maxY=c[1];
  }

  const W=1600;
  const H=1100;
  const mapX=70;
  const mapY=150;
  const mapW=1080;
  const mapH=850;
  const legendX=1210;
  const legendY=250;

  const project=([lon,lat])=>{
    const x=mapX+(lon-minX)/(maxX-minX)*mapW;
    const y=mapY+(maxY-lat)/(maxY-minY)*mapH;
    return [x,y];
  };

  const pathFromFeature=f=>featureRings(f.geometry).map(ring=>{
    return ring.map((c,i)=>{
      const [x,y]=project(c);
      return `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ")+" Z";
  }).join(" ");

  const getKey=f=>isUF?getUFCode(f):getMunCode(f);

  const paths=features.map(f=>{
    const key=getKey(f);
    const row=byKey.get(key);
    const value=row?Number(row[ind]||0):0;
    const fill=colorFromBreaks(value,breaks);
    const stroke=isUF?"#475569":"#94a3b8";
    const strokeWidth=isUF?"1.4":".35";
    return `<path d="${pathFromFeature(f)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }).join("\n");

  const title=`${diseaseLabel()} — ${indicatorLabel()}`;
  const subtitle=`${isUF?"Mapa das UFs":"Mapa municipal"} | ${yearsLabel()} | Fonte: SINAN/DATASUS; população: IBGE/SIDRA`;
  const methodLabel=$("map-class")?.selectedOptions?.[0]?.textContent||"Intervalos iguais";

  let legend="";
  if(breaks){
    const legendRows=[
      {label:`${fmt1.format(breaks[3])} – ${fmt1.format(breaks[4])}`,color:MAP_COLORS[4]},
      {label:`${fmt1.format(breaks[2])} – ${fmt1.format(breaks[3])}`,color:MAP_COLORS[3]},
      {label:`${fmt1.format(breaks[1])} – ${fmt1.format(breaks[2])}`,color:MAP_COLORS[2]},
      {label:`${fmt1.format(breaks[0])} – ${fmt1.format(breaks[1])}`,color:MAP_COLORS[1]},
      {label:`> 0 – ${fmt1.format(breaks[0])}`,color:MAP_COLORS[0]},
      {label:"Sem notificação",color:"#f1f5f9"}
    ];

    legend=legendRows.map((r,i)=>`
      <rect x="${legendX}" y="${legendY+90+i*44}" width="30" height="22" rx="5" fill="${r.color}" stroke="#cbd5e1"/>
      <text x="${legendX+46}" y="${legendY+107+i*44}" font-size="24" fill="#1e293b">${svgEscape(r.label)}</text>
    `).join("");
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="70" y="70" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#0f172a">${svgEscape(title)}</text>
      <text x="70" y="112" font-family="Arial, sans-serif" font-size="22" fill="#475569">${svgEscape(subtitle)}</text>
      <g>${paths}</g>
      <rect x="${legendX-32}" y="${legendY-54}" width="350" height="390" rx="24" fill="#ffffff" stroke="#cbd5e1"/>
      <text x="${legendX}" y="${legendY}" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#0f172a">Legenda</text>
      <text x="${legendX}" y="${legendY+38}" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${svgEscape(indicatorLabel())}</text>
      <text x="${legendX}" y="${legendY+66}" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Classificação: ${svgEscape(methodLabel)}</text>
      ${legend}
      <text x="70" y="1060" font-family="Arial, sans-serif" font-size="18" fill="#64748b">
        LEPRECHAS — Painel Epidemiológico Brasileiro. Uso exploratório; não substitui sistemas oficiais de vigilância.
      </text>
    </svg>`;
}

async function downloadCleanMap(kind){
  if(kind==="mun")await ensureGeoMun();
  const svg=buildCleanMapSVG(kind);
  if(!svg)return;

  const disease=($("disease")?.value||"doenca").toLowerCase();
  const years=yearsLabel().replaceAll(" ","_").replaceAll(",","-").replaceAll("–","-");

  if(kind==="mun"){
    downloadText(svg,`leprechas_mapa_municipal_${disease}_${years}.svg`,"image/svg+xml;charset=utf-8");
    return;
  }

  const svgBlob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(svgBlob);
  const img=new Image();

  img.onload=()=>{
    const canvas=document.createElement("canvas");
    canvas.width=1600;
    canvas.height=1100;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob=>{
      if(!blob){
        downloadText(svg,`leprechas_mapa_${kind}.svg`,"image/svg+xml;charset=utf-8");
        return;
      }

      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=`leprechas_mapa_${kind}_${disease}_${years}.png`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    },"image/png");
  };

  img.onerror=()=>{
    URL.revokeObjectURL(url);
    downloadText(svg,`leprechas_mapa_${kind}.svg`,"image/svg+xml;charset=utf-8");
  };

  img.src=url;
}

// ── Modal ──

function openModal(){
  const modal=$("lep-about-modal");
  if(modal){
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    modal.querySelector("button")?.focus();
  }
}

function closeModal(){
  const modal=$("lep-about-modal");
  if(modal){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    $("about-panel-btn")?.focus();
  }
}

// ── Disease change ──

async function diseaseChanged(){
  await loadDisease($("disease").value);
  populateCompareSelect();
  setupFilters();
  await refresh();
}

// ── Init ──

async function init(){
  showLoading();

  const urlState=readURLState();

  const [manRes,ufRes]=await Promise.all([
    fetch(MANIFEST_URL),
    fetch(GEO_UF_URL).catch(()=>null)
  ]);

  if(!manRes.ok){
    toast("Manifesto de dados não encontrado","error");
    throw new Error("Manifesto de dados não encontrado");
  }

  MANIFEST=await manRes.json();
  if(ufRes&&ufRes.ok)GEO_UF=await ufRes.json();
  else toast("GeoJSON das UFs não encontrado","warn");

  await loadPopulation();
  setupDiseaseSelect();

  if(urlState.disease&&MANIFEST.some(d=>d.codigo===urlState.disease)){
    $("disease").value=urlState.disease;
  }

  await loadDisease($("disease").value);
  setupFilters();

  if(urlState.region)$("region").value=urlState.region;
  if(urlState.uf)$("uf").value=urlState.uf;
  if(urlState.mun)$("mun").value=urlState.mun;
  if(urlState.indicator)$("indicator").value=urlState.indicator;
  if(urlState.mapClass)$("map-class").value=urlState.mapClass;
  if(urlState.years){
    const valid=urlState.years.filter(y=>allAvailableYears().includes(y));
    if(valid.length)setSelectedYears(valid);
  }

  await refresh();
  hideLoading();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
}

// ── Event listeners ──

$("apply").onclick=()=>refresh();
$("clear").onclick=()=>{
  $("region").value="";
  $("uf").value="";
  $("mun").value="";
  if($("inc-min"))$("inc-min").value="";
  if($("inc-max"))$("inc-max").value="";
  if($("compare"))[...$("compare").options].forEach(o=>o.selected=false);
  const ys=allAvailableYears();
  if(ys.length)setSelectedYears([ys.at(-1)]);
  setupFilters();
  refresh();
};

$("all-years").onclick=()=>{setSelectedYears(allAvailableYears());refresh();};
$("last-year").onclick=()=>{const ys=allAvailableYears();if(ys.length)setSelectedYears([ys.at(-1)]);refresh();};
$("region").onchange=()=>{$("uf").value="";$("mun").value="";setupFilters();debouncedRefresh();};
$("uf").onchange=()=>{$("mun").value="";debouncedRefresh();};
$("disease").onchange=diseaseChanged;
$("year").onchange=debouncedRefresh;
$("indicator").onchange=debouncedRefresh;
$("map-class").onchange=debouncedRefresh;
$("download-csv").onclick=downloadFilteredCSV;
$("download-map-uf-clean").onclick=()=>downloadCleanMap("uf");
$("download-map-mun-clean").onclick=()=>downloadCleanMap("mun");
$("download-series-png").onclick=()=>downloadPlotlyChart("series","serie",`${diseaseLabel()} — Série histórica | ${yearsLabel()}`);
$("download-uf-png").onclick=()=>downloadPlotlyChart("ufs","ranking_ufs",`${diseaseLabel()} — Ranking de UFs | ${yearsLabel()}`);
$("download-compare-png").onclick=()=>downloadPlotlyChart("compare-chart","comparacao",`Comparação de doenças — ${indicatorLabel()} | ${yearsLabel()}`);
$("download-region-png").onclick=()=>downloadPlotlyChart("region-chart","regioes",`${diseaseLabel()} — Casos por região | ${yearsLabel()}`);
$("about-panel-btn").onclick=openModal;
$("close-about-modal").onclick=closeModal;
$("lep-about-modal").addEventListener("click",e=>{if(e.target.id==="lep-about-modal")closeModal();});
$("theme-toggle").onclick=toggleTheme;

$("copy-citation").onclick=()=>{
  const txt=$("lep-citation")?.textContent.trim()||"";
  if(navigator.clipboard){
    navigator.clipboard.writeText(txt).then(()=>toast("Citação copiada","success",2000));
  }
};

document.addEventListener("keydown",e=>{
  if(e.key==="Escape")closeModal();
});

document.querySelectorAll(".segmented button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    $("indicator").value=btn.dataset.indicator;
    debouncedRefresh();
  });
});

window.addEventListener("resize",debounce(()=>{
  if(typeof Plotly==="undefined")return;
  ["series","ufs","compare-chart","region-chart"].forEach(id=>{
    const el=$(id);
    if(el&&el.data)Plotly.Plots.resize(el);
  });
},250));

window.addEventListener("popstate",()=>{
  const state=readURLState();
  if(state.disease&&$("disease").value!==state.disease){
    $("disease").value=state.disease;
    diseaseChanged();
  }
});

init().catch(e=>{
  hideLoading();
  $("row-count").textContent="erro ao carregar";
  toast("Erro ao inicializar: "+e.message,"error",8000);
});
