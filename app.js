const MANIFEST_URL="data/manifest.json?v=20260512-8";
const GEO_UF_URL="data/ufs.geojson?v=20260512-8";
const GEO_MUN_URL="data/municipios.geojson?v=20260512-8";
const POP_URL="data/populacao_municipio_ano.csv?v=20260512-8";
const $=id=>document.getElementById(id);
const fmt=new Intl.NumberFormat("pt-BR");
const fmt1=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1});
let MANIFEST=[],DATA=[],GEO_UF=null,GEO_MUN=null,POP_MAP=new Map(),POP_SERIES=new Map(),MAP_UF=null,MAP_MUN=null,LAYER_UF=null,LAYER_MUN=null;
const CACHE={};

function parseCSV(text){const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++}else if(c==='"'){q=!q}else if(c===","&&!q){row.push(cell);cell=""}else if((c==="\n"||c==="\r")&&!q){if(c==="\r"&&n==="\n")i++;row.push(cell);if(row.some(v=>v.trim()!==""))rows.push(row);row=[];cell=""}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}const head=rows.shift().map(x=>x.trim());return rows.map(r=>{const o={};head.forEach((h,i)=>o[h]=(r[i]??"").trim());return o})}
function num(x){if(x===undefined||x===null||x==="")return null;const n=Number(String(x).replace(/\./g,"").replace(",","."));return Number.isFinite(n)?n:null}
function popKey(cod,ano){return String(cod).replace(/\D/g,"").padStart(6,"0").slice(0,6)+"|"+String(ano)}
async function loadPopulation(){
  try{
    const res=await fetch(POP_URL);

    if(!res.ok)return;

    const rows=parseCSV(await res.text());

    POP_MAP=new Map();
    POP_SERIES=new Map();

    for(const r of rows){
      const cod=String(r.cod_mun6||"")
        .replace(/\D/g,"")
        .padStart(6,"0")
        .slice(0,6);

      const ano=Number(r.ano);
      const pop=num(r.populacao);

      if(cod&&Number.isFinite(ano)&&Number.isFinite(pop)&&pop>0){
        POP_MAP.set(popKey(cod,ano),pop);

        if(!POP_SERIES.has(cod))POP_SERIES.set(cod,[]);
        POP_SERIES.get(cod).push({ano,pop});
      }
    }

    for(const [cod,serie] of POP_SERIES.entries()){
      serie.sort((a,b)=>a.ano-b.ano);
    }
  }catch(e){
    console.warn("População não carregada:",e);
  }
}
function interpolatePopulation(cod,ano){
  cod=String(cod).replace(/\D/g,"").padStart(6,"0").slice(0,6);
  ano=Number(ano);

  if(!cod||!Number.isFinite(ano))return null;

  const exact=POP_MAP.get(popKey(cod,ano));
  if(Number.isFinite(exact))return exact;

  const serie=POP_SERIES.get(cod);

  if(!serie||serie.length===0)return null;

  const before=serie.filter(d=>d.ano<ano).at(-1);
  const after=serie.find(d=>d.ano>ano);

  if(before&&after&&after.ano!==before.ano){
    const t=(ano-before.ano)/(after.ano-before.ano);
    return Math.round(before.pop+t*(after.pop-before.pop));
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
          return Math.round(estimada);
        }
      }
    }

    return before.pop;
  }

  if(after){
    return after.pop;
  }

  return null;
}
function norm(r){
  const casos=num(r.casos)||0;

  const cod=String(r.cod_mun6||"")
    .replace(/\D/g,"")
    .padStart(6,"0")
    .slice(0,6);

  const ano=Number(r.ano);

  let pop=num(r.populacao);

  if((pop===null||!Number.isFinite(pop)||pop<=0)){
    pop=interpolatePopulation(cod,ano);
  }

  let inc=num(r.incidencia_100mil);

  if((inc===null||!Number.isFinite(inc))&&pop>0){
    inc=casos/pop*100000;
  }

  return{
    doenca:(r.doenca||"").toUpperCase(),
    doenca_nome:r.doenca_nome||r.doenca,
    cod_mun6:cod,
    municipio:r.municipio||"",
    uf:(r.uf||"").toUpperCase(),
    ano:ano,
    casos:casos,
    populacao:pop,
    incidencia_100mil:inc
  };
}
function group(rows,keys){const m=new Map();for(const r of rows){const k=keys.map(x=>r[x]).join("|");if(!m.has(k)){const o={casos:0,populacao:0,_pop:0,_muns:new Set(),_munsPos:new Set()};keys.forEach(x=>o[x]=r[x]);m.set(k,o)}const o=m.get(k);o.casos+=r.casos||0;if(Number.isFinite(r.populacao)){o.populacao+=r.populacao;o._pop++}if(r.cod_mun6)o._muns.add(r.cod_mun6);if(r.cod_mun6&&(r.casos||0)>0)o._munsPos.add(r.cod_mun6)}return[...m.values()].map(o=>{const pop=o._pop?o.populacao:null;const inc=pop?o.casos/pop*100000:null;const municipios=o._muns.size;const municipios_com_notificacao=o._munsPos.size;delete o._pop;delete o._muns;delete o._munsPos;return{...o,populacao:pop,incidencia_100mil:inc,municipios,municipios_com_notificacao}})}
function selectedYears(){return[...$("year").selectedOptions].map(o=>Number(o.value)).filter(Number.isFinite)}
function setSelectedYears(years){const ys=new Set(years.map(Number));[...$("year").options].forEach(o=>{o.selected=ys.has(Number(o.value))})}
function allAvailableYears(){return[...$("year").options].map(o=>Number(o.value)).filter(Number.isFinite)}
async function loadDisease(code){if(CACHE[code]){DATA=CACHE[code];return}const item=MANIFEST.find(d=>d.codigo===code);if(!item)throw new Error("Doença não encontrada");$("row-count").textContent="carregando "+item.doenca+"...";const res=await fetch(item.arquivo+"?v=20260512-7");if(!res.ok)throw new Error("Arquivo da doença não encontrado: "+item.arquivo);DATA=parseCSV(await res.text()).map(norm).filter(r=>r.doenca&&r.cod_mun6&&Number.isFinite(r.ano));CACHE[code]=DATA;$("row-count").textContent=`${fmt.format(DATA.length)} linhas nesta doença | ${fmt.format(MANIFEST.reduce((a,b)=>a+b.linhas,0))} linhas no total | ${fmt.format(POP_MAP.size)} populações carregadas`}
function setupDiseaseSelect(){MANIFEST.sort((a,b)=>a.doenca.localeCompare(b.doenca,"pt-BR"));$("disease").innerHTML=MANIFEST.map(d=>`<option value="${d.codigo}">${d.doenca}</option>`).join("")}
function setupFilters(){const oldYears=selectedYears(),oldUf=$("uf").value;const years=[...new Set(DATA.map(r=>r.ano))].sort((a,b)=>a-b);$("year").innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");const validOld=oldYears.filter(y=>years.includes(y));if(validOld.length>0)setSelectedYears(validOld);else setSelectedYears([years.at(-1)]);const ufs=["",...[...new Set(DATA.map(r=>r.uf).filter(Boolean))].sort()];$("uf").innerHTML=ufs.map(u=>`<option value="${u}">${u||"Brasil"}</option>`).join("");if(ufs.includes(oldUf))$("uf").value=oldUf;updateMuns()}
function updateMuns(){const uf=$("uf").value;const years=selectedYears();const muns=[...new Set(DATA.filter(r=>(years.length===0||years.includes(r.ano))&&(!uf||r.uf===uf)).map(r=>r.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));$("mun-list").innerHTML=muns.map(m=>`<option value="${m}"></option>`).join("")}
function filtered(ignoreYear=false){const years=selectedYears(),uf=$("uf").value,mun=$("mun").value.trim();return DATA.filter(r=>(ignoreYear||years.length===0||years.includes(r.ano))&&(!uf||r.uf===uf)&&(!mun||r.municipio===mun))}
function rowsForSelectedYearsNoGeoFilters(){const years=selectedYears();return DATA.filter(r=>years.length===0||years.includes(r.ano))}
function getMunCode(f){const p=f.properties||{};const raw=p.cod_mun6||p.CD_MUN||p.CD_GEOCMU||p.GEOCODIGO||p.id||f.id||"";return String(raw).replace(/\D/g,"").padStart(7,"0").slice(0,6)}
function getUFCode(f){const p=f.properties||{};return String(p.UF_05||p.uf||p.UF||p.sigla||p.SIGLA_UF||"").toUpperCase()}
function color(v,max){if(!Number.isFinite(v)||v<=0||!Number.isFinite(max)||max<=0)return"#f1f5f9";const t=Math.min(1,v/max);if(t>.8)return"#7f1d1d";if(t>.6)return"#b91c1c";if(t>.4)return"#ef4444";if(t>.2)return"#f97316";return"#fed7aa"}
function initMaps(){if(!MAP_UF){MAP_UF=L.map("map-uf",{scrollWheelZoom:false}).setView([-14.2,-51.9],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(MAP_UF)}if(!MAP_MUN){MAP_MUN=L.map("map-mun",{scrollWheelZoom:false}).setView([-14.2,-51.9],5);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(MAP_MUN)}}
function renderMaps(rows){initMaps();const ind=$("indicator").value;if(LAYER_UF){LAYER_UF.remove();LAYER_UF=null}if(LAYER_MUN){LAYER_MUN.remove();LAYER_MUN=null}
const ufRows=group(rows,["uf"]);const byUF=new Map(ufRows.map(r=>[r.uf,r]));const maxUF=Math.max(0,...ufRows.map(r=>Number(r[ind]||0)));
if(GEO_UF){LAYER_UF=L.geoJSON(GEO_UF,{style:f=>{const sigla=getUFCode(f);const r=byUF.get(sigla);const v=r?r[ind]:0;return{color:"#64748b",weight:.8,fillColor:color(v,maxUF),fillOpacity:r&&v>0?.78:.08}},onEachFeature:(f,l)=>{const p=f.properties||{};const sigla=getUFCode(f);const r=byUF.get(sigla);const nome=p.NOME_UF||sigla;if(r)l.bindPopup(`<strong>${nome} (${sigla})</strong><br>Casos no período: ${fmt.format(r.casos||0)}<br>População-ano: ${r.populacao?fmt.format(r.populacao):"—"}<br>Incidência: ${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}<br>Municípios com notificações: ${fmt.format(r.municipios_com_notificacao||0)}`);else l.bindPopup(`<strong>${nome} (${sigla})</strong><br>Sem notificação no filtro`)}}).addTo(MAP_UF);try{MAP_UF.fitBounds(LAYER_UF.getBounds(),{padding:[15,15]})}catch(e){}$("map-uf-status").textContent="Mapa das UFs carregado";}else{$("map-uf-status").textContent="data/ufs.geojson não encontrado";}
const munRows=group(rows,["uf","cod_mun6","municipio"]);const byCode=new Map(munRows.map(r=>[r.cod_mun6,r]));const maxMun=Math.max(0,...munRows.map(r=>Number(r[ind]||0)));
if(GEO_MUN){LAYER_MUN=L.geoJSON(GEO_MUN,{style:f=>{const code=getMunCode(f);const r=byCode.get(code);const v=r?r[ind]:0;return{color:"#94a3b8",weight:.35,fillColor:color(v,maxMun),fillOpacity:r&&v>0?.78:.04}},onEachFeature:(f,l)=>{const code=getMunCode(f);const r=byCode.get(code);const name=(f.properties&&f.properties.name)||r?.municipio||code;if(r)l.bindPopup(`<strong>${name} - ${r.uf}</strong><br>Casos no período: ${fmt.format(r.casos||0)}<br>População-ano: ${r.populacao?fmt.format(r.populacao):"—"}<br>Incidência: ${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}`)}}).addTo(MAP_MUN);try{MAP_MUN.fitBounds(LAYER_MUN.getBounds(),{padding:[15,15]})}catch(e){}$("map-mun-status").textContent="Mapa municipal carregado";}else{$("map-mun-status").textContent="data/municipios.geojson não encontrado";}}
function refresh(){updateMuns();const rows=filtered(),total=group(rows,[])[0]||{casos:0,populacao:null,incidencia_100mil:null,municipios_com_notificacao:0};$("card-casos").textContent=fmt.format(total.casos||0);$("card-pop").textContent=total.populacao?fmt.format(total.populacao):"—";$("card-inc").textContent=Number.isFinite(total.incidencia_100mil)?fmt1.format(total.incidencia_100mil):"—";$("card-muns").textContent=fmt.format(total.municipios_com_notificacao||0);
const ser=group(rows,["ano"]).sort((a,b)=>a.ano-b.ano);Plotly.newPlot("series",[{x:ser.map(r=>r.ano),y:ser.map(r=>r.casos),type:"bar",name:"Casos",marker:{color:"#1f77b4"}}],{margin:{t:20,r:20,b:45,l:60},yaxis:{title:"Casos/Ano"},xaxis:{title:"Ano",type:"category"}},{responsive:true,displayModeBar:false});
const ind=$("indicator").value;const ufRank=group(rowsForSelectedYearsNoGeoFilters(),["uf"]).filter(r=>r.uf&&(r[ind]||0)>0).sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity));Plotly.newPlot("ufs",[{x:ufRank.map(r=>r[ind]),y:ufRank.map(r=>r.uf),type:"bar",orientation:"h",marker:{color:ufRank.map((_,i)=>i<5?"#1e3a8a":"#60a5fa")},text:ufRank.map(r=>fmt.format(r[ind]||0)),textposition:"inside",insidetextanchor:"end",hovertemplate:"<b>%{y}</b><br>Valor: %{x}<extra></extra>"}],{margin:{t:20,r:30,b:50,l:60},height:520,xaxis:{title:ind==="casos"?"Casos no período":"Incidência / 100 mil"},yaxis:{automargin:true,categoryorder:"total ascending"},plot_bgcolor:"#fff",paper_bgcolor:"#fff"},{responsive:true,displayModeBar:false});
const munRank=group(rows,["uf","cod_mun6","municipio"]).filter(r=>(r[ind]||0)>0).sort((a,b)=>(b[ind]??-Infinity)-(a[ind]??-Infinity)).slice(0,100);$("table").innerHTML="<thead><tr><th>UF</th><th>Código</th><th>Município</th><th>Casos no período</th><th>População-ano estimada</th><th>Incidência</th></tr></thead><tbody>"+munRank.map(r=>`<tr><td>${r.uf}</td><td>${r.cod_mun6}</td><td>${r.municipio}</td><td>${fmt.format(r.casos||0)}</td><td>${r.populacao?fmt.format(r.populacao):"—"}</td><td>${Number.isFinite(r.incidencia_100mil)?fmt1.format(r.incidencia_100mil):"—"}</td></tr>`).join("")+"</tbody>";renderMaps(rows)}
async function diseaseChanged(){await loadDisease($("disease").value);setupFilters();refresh()}
async function init(){const [manRes,ufRes,munRes]=await Promise.all([fetch(MANIFEST_URL),fetch(GEO_UF_URL).catch(()=>null),fetch(GEO_MUN_URL).catch(()=>null)]);if(!manRes.ok)throw new Error("Manifesto de dados não encontrado");MANIFEST=await manRes.json();if(ufRes&&ufRes.ok)GEO_UF=await ufRes.json();if(munRes&&munRes.ok)GEO_MUN=await munRes.json();await loadPopulation();setupDiseaseSelect();await diseaseChanged()}
$("apply").onclick=refresh;$("clear").onclick=()=>{$("uf").value="";$("mun").value="";const ys=allAvailableYears();if(ys.length)setSelectedYears([ys.at(-1)]);refresh()};$("all-years").onclick=()=>{setSelectedYears(allAvailableYears());refresh()};$("last-year").onclick=()=>{const ys=allAvailableYears();if(ys.length)setSelectedYears([ys.at(-1)]);refresh()};$("uf").onchange=()=>{$("mun").value="";refresh()};$("disease").onchange=diseaseChanged;$("year").onchange=refresh;$("indicator").onchange=refresh;init().catch(e=>alert("Erro: "+e.message));
/* ===== Extras EpiBrasil: institucional, legendas e downloads ===== */

function epiEnsureUIExtras(){
  const filters=document.querySelector(".filters");

  if(filters&&!document.getElementById("download-csv")){
    const area=document.createElement("div");
    area.className="filter-download-area";
    area.innerHTML=`
      <button id="download-csv" type="button" class="download-btn">Baixar CSV filtrado</button>
    `;
    const note=filters.querySelector(".note");
    if(note)filters.insertBefore(area,note);
    else filters.appendChild(area);
  }

  const topbar=document.querySelector(".topbar");
  if(topbar&&!document.getElementById("about-panel-btn")){
    const wrap=document.createElement("div");
    wrap.className="top-actions";

    const oldBadge=document.getElementById("row-count");
    if(oldBadge&&oldBadge.parentElement===topbar){
      topbar.removeChild(oldBadge);
      wrap.appendChild(oldBadge);
    }

    const about=document.createElement("button");
    about.id="about-panel-btn";
    about.type="button";
    about.className="about-btn";
    about.textContent="Fonte e metodologia";
    wrap.appendChild(about);

    topbar.appendChild(wrap);
  }

  const mapUf=document.getElementById("map-uf");
  if(mapUf&&!document.getElementById("download-map-uf")){
    const panel=mapUf.closest(".panel");
    const toolbar=document.createElement("div");
    toolbar.className="map-toolbar";
    toolbar.innerHTML=`
      <button id="download-map-uf" type="button" class="download-btn secondary-download">Baixar mapa UF</button>
    `;
    panel.insertBefore(toolbar,mapUf);

    const box=document.createElement("div");
    box.className="map-box";
    mapUf.parentNode.insertBefore(box,mapUf);
    box.appendChild(mapUf);

    const legend=document.createElement("div");
    legend.id="legend-map-uf";
    legend.className="map-legend";
    box.appendChild(legend);
  }

  const mapMun=document.getElementById("map-mun");
  if(mapMun&&!document.getElementById("download-map-mun")){
    const panel=mapMun.closest(".panel");
    const toolbar=document.createElement("div");
    toolbar.className="map-toolbar";
    toolbar.innerHTML=`
      <button id="download-map-mun" type="button" class="download-btn secondary-download">Baixar mapa municipal</button>
    `;
    panel.insertBefore(toolbar,mapMun);

    const box=document.createElement("div");
    box.className="map-box";
    mapMun.parentNode.insertBefore(box,mapMun);
    box.appendChild(mapMun);

    const legend=document.createElement("div");
    legend.id="legend-map-mun";
    legend.className="map-legend";
    box.appendChild(legend);
  }

  if(!document.getElementById("epi-splash")){
    document.body.insertAdjacentHTML("afterbegin",`
      <section id="epi-splash" class="epi-splash">
        <div class="epi-splash-card">
          <div class="epi-splash-kicker">Painel epidemiológico brasileiro</div>
          <h1>EpiBrasil</h1>
          <p>
            Plataforma estática para visualização exploratória de doenças e agravos notificados,
            com agregação por município, Unidade Federativa, ano e período selecionado.
          </p>

          <div class="epi-splash-grid">
            <div class="epi-splash-box">
              <h3>Fontes dos dados</h3>
              <ul>
                <li>Casos agregados: SINAN/DATASUS, exportados via TABNET.</li>
                <li>População municipal: IBGE/SIDRA.</li>
                <li>Malhas territoriais: arquivos GeoJSON de UFs e municípios.</li>
              </ul>
            </div>

            <div class="epi-splash-box">
              <h3>Indicadores</h3>
              <ul>
                <li>Casos no ano ou período selecionado.</li>
                <li>População-ano, quando disponível.</li>
                <li>Incidência por 100 mil habitantes.</li>
                <li>Municípios com notificações.</li>
              </ul>
            </div>

            <div class="epi-splash-box">
              <h3>Metodologia</h3>
              <ul>
                <li>Os dados são agregados por município-ano.</li>
                <li>Para múltiplos anos, os casos e populações-ano são somados.</li>
                <li>A incidência é calculada por: casos / população × 100.000.</li>
                <li>Não são usados microdados identificáveis.</li>
              </ul>
            </div>
          </div>

          <p>
            Este painel é uma ferramenta exploratória. Diferenças de cobertura, oportunidade de notificação,
            revisão das bases e mudanças operacionais dos sistemas devem ser consideradas na interpretação.
          </p>

          <div class="epi-splash-actions">
            <button id="close-splash" type="button">Entrar no painel</button>
            <button id="close-splash-secondary" type="button" class="secondary">Continuar explorando</button>
          </div>
        </div>
      </section>
    `);
  }
}

function epiCloseSplash(){
  const splash=document.getElementById("epi-splash");
  if(splash)splash.style.display="none";
}

function epiShowSplash(){
  const splash=document.getElementById("epi-splash");
  if(splash)splash.style.display="flex";
}

function epiCsvEscape(value){
  if(value===null||value===undefined)return "";
  const s=String(value);
  if(/[",\n\r;]/.test(s))return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function epiDownloadBlob(content,filename,type){
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

function epiDownloadFilteredCSV(){
  if(typeof filtered!=="function"){
    alert("Filtro ainda não carregado.");
    return;
  }

  const rows=filtered(false);
  const headers=[
    "doenca",
    "doenca_nome",
    "cod_mun6",
    "municipio",
    "uf",
    "ano",
    "casos",
    "populacao",
    "incidencia_100mil"
  ];

  const csv=[
    headers.join(","),
    ...rows.map(r=>headers.map(h=>epiCsvEscape(
      h==="incidencia_100mil"&&Number.isFinite(r[h]) ? r[h].toFixed(6) : r[h]
    )).join(","))
  ].join("\n");

  const disease=$("disease")?.value||"doenca";
  const years=typeof selectedYears==="function" ? selectedYears().join("-") : "periodo";
  epiDownloadBlob(csv,`epibrasil_${disease}_${years}_filtrado.csv`,"text/csv;charset=utf-8");
}

function epiLegendRanges(max){
  if(!Number.isFinite(max)||max<=0){
    return [
      {label:"Sem notificação",color:"#f1f5f9"}
    ];
  }

  const b1=max*0.2;
  const b2=max*0.4;
  const b3=max*0.6;
  const b4=max*0.8;

  return [
    {label:`${fmt1.format(b4)} – ${fmt1.format(max)}`,color:"#7f1d1d"},
    {label:`${fmt1.format(b3)} – ${fmt1.format(b4)}`,color:"#b91c1c"},
    {label:`${fmt1.format(b2)} – ${fmt1.format(b3)}`,color:"#ef4444"},
    {label:`${fmt1.format(b1)} – ${fmt1.format(b2)}`,color:"#f97316"},
    {label:`> 0 – ${fmt1.format(b1)}`,color:"#fed7aa"},
    {label:"Sem notificação",color:"#f1f5f9"}
  ];
}

function epiLegendHTML(title,max){
  const ind=$("indicator")?.value||"casos";
  const label=ind==="casos" ? "Casos" : "Incidência";
  return `
    <strong>${title}</strong>
    <div style="margin-bottom:6px;color:#64748b">${label}</div>
    ${epiLegendRanges(max).map(r=>`
      <div class="legend-row">
        <span class="legend-swatch" style="background:${r.color}"></span>
        <span>${r.label}</span>
      </div>
    `).join("")}
  `;
}

function epiUpdateLegends(){
  if(typeof filtered!=="function"||typeof group!=="function")return;

  const rows=filtered(false);
  const ind=$("indicator")?.value||"casos";

  const ufRows=group(rows,["uf"]).filter(r=>r.uf);
  const munRows=group(rows,["uf","cod_mun6","municipio"]);

  const maxUF=Math.max(0,...ufRows.map(r=>Number(r[ind]||0)));
  const maxMun=Math.max(0,...munRows.map(r=>Number(r[ind]||0)));

  const legUF=document.getElementById("legend-map-uf");
  const legMun=document.getElementById("legend-map-mun");

  if(legUF)legUF.innerHTML=epiLegendHTML("Legenda — UFs",maxUF);
  if(legMun)legMun.innerHTML=epiLegendHTML("Legenda — municípios",maxMun);
}

async function epiDownloadMap(mapId,filename){
  const el=document.getElementById(mapId);

  if(!el){
    alert("Mapa não encontrado.");
    return;
  }

  if(!window.html2canvas){
    alert("Biblioteca de captura não carregada.");
    return;
  }

  const isUF=mapId==="map-uf";
  const map=isUF ? MAP_UF : MAP_MUN;
  const layer=isUF ? LAYER_UF : LAYER_MUN;
  const box=el.closest(".map-box")||el;

  try{
    if(map&&layer){
      map.invalidateSize();

      try{
        map.fitBounds(layer.getBounds(),{
          padding:[24,24],
          maxZoom:isUF ? 5 : 6
        });
      }catch(e){}
    }

    box.classList.add("exporting-map");

    await new Promise(resolve=>setTimeout(resolve,700));

    const canvas=await html2canvas(box,{
      backgroundColor:"#ffffff",
      scale:2,
      useCORS:true,
      logging:false,
      ignoreElements:(node)=>{
        return node.classList&&(
          node.classList.contains("leaflet-control-attribution")||
          node.classList.contains("leaflet-control-zoom")
        );
      }
    });

    box.classList.remove("exporting-map");

    canvas.toBlob(blob=>{
      if(!blob){
        alert("Não foi possível gerar a imagem do mapa.");
        return;
      }

      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },"image/png");
  }catch(e){
    box.classList.remove("exporting-map");
    console.error(e);
    alert("Não foi possível baixar o mapa.");
  }
}

epiEnsureUIExtras();

document.addEventListener("click",e=>{
  if(e.target&&e.target.id==="download-csv")epiDownloadFilteredCSV();
  if(e.target&&e.target.id==="download-map-uf")epiDownloadMap("map-uf","epibrasil_mapa_ufs.png");
  if(e.target&&e.target.id==="download-map-mun")epiDownloadMap("map-mun","epibrasil_mapa_municipios.png");
  if(e.target&&e.target.id==="about-panel-btn")epiShowSplash();
  if(e.target&&["close-splash","close-splash-secondary"].includes(e.target.id))epiCloseSplash();
});

if(typeof refresh==="function"){
  const epiOriginalRefresh=refresh;
  refresh=function(){
    epiOriginalRefresh();
    setTimeout(epiUpdateLegends,150);
  };
}

setTimeout(epiUpdateLegends,800);

/* ==========================================================
   LEPRECHAS — pacote de melhorias institucionais e analíticas
   Versão: 20260512-11
   ========================================================== */
