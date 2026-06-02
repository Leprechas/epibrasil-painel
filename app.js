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

if(!window.LEP_ENHANCEMENTS_INSTALLED){
  window.LEP_ENHANCEMENTS_INSTALLED=true;

  const LEP_REGIONS={
    "Norte":["AC","AP","AM","PA","RO","RR","TO"],
    "Nordeste":["AL","BA","CE","MA","PB","PE","PI","RN","SE"],
    "Centro-Oeste":["DF","GO","MT","MS"],
    "Sudeste":["ES","MG","RJ","SP"],
    "Sul":["PR","RS","SC"]
  };

  const LEP_COLORS=["#fed7aa","#f97316","#ef4444","#b91c1c","#7f1d1d"];
  let LEP_BREAKS={uf:null,mun:null};

  function lepRegionOfUF(uf){
    uf=String(uf||"").toUpperCase();
    for(const [reg,ufs] of Object.entries(LEP_REGIONS)){
      if(ufs.includes(uf))return reg;
    }
    return "";
  }

  function lepSelectedRegion(){
    return document.getElementById("region")?.value||"";
  }

  function lepIndicatorLabel(){
    const ind=document.getElementById("indicator")?.value||"casos";
    return ind==="casos" ? "Casos" : "Incidência / 100 mil";
  }

  function lepDiseaseLabel(){
    const sel=document.getElementById("disease");
    return sel?.selectedOptions?.[0]?.textContent||"Doença selecionada";
  }

  function lepYearsLabel(){
    if(typeof selectedYears!=="function")return "período selecionado";
    const years=selectedYears().sort((a,b)=>a-b);
    if(years.length===0)return "todos os anos";
    if(years.length===1)return String(years[0]);
    const consecutive=years.every((y,i)=>i===0||y===years[i-1]+1);
    if(consecutive)return `${years[0]}–${years.at(-1)}`;
    return years.join(", ");
  }

  function lepCsvEscape(value){
    if(value===null||value===undefined)return "";
    const s=String(value);
    if(/[",\n\r;]/.test(s))return `"${s.replace(/"/g,'""')}"`;
    return s;
  }

  function lepFmt(value,digits=1){
    if(!Number.isFinite(value))return "—";
    return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:digits}).format(value);
  }

  function lepEnsureHeader(){
    const topbar=document.querySelector(".topbar");
    if(!topbar)return;

    const badge=document.getElementById("row-count");
    const oldActions=topbar.querySelector(".top-actions");

    topbar.innerHTML=`
      <div class="brand">
        <div class="brand-line">
          <img src="assets/logo-leprechas.png" alt="LEPRECHAS — Painel Epidemiológico" class="site-logo"
               onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=&quot;brand-title-fallback&quot;>LEPRECHAS</div>')">
        </div>
        <p class="brand-subtitle">
          Painel Epidemiológico Brasileiro para visualização exploratória de doenças e agravos notificados,
          com indicadores municipais, estaduais e nacionais.
        </p>
        <div class="source-strip">
          <span class="source-chip">Casos: SINAN/DATASUS</span>
          <span class="source-chip">População: IBGE/SIDRA</span>
          <span class="source-chip">Malhas: GeoJSON territorial</span>
        </div>
      </div>
    `;

    const actions=document.createElement("div");
    actions.className="top-actions";

    if(badge)actions.appendChild(badge);

    const about=document.createElement("button");
    about.id="about-panel-btn";
    about.type="button";
    about.className="about-btn";
    about.textContent="Sobre, fonte e metodologia";
    actions.appendChild(about);

    topbar.appendChild(actions);
  }

  function lepEnsureFilters(){
    const filters=document.querySelector(".filters");
    if(!filters)return;

    if(!document.getElementById("region")){
      const ufLabel=[...filters.querySelectorAll("label")].find(l=>l.textContent.trim().startsWith("UF"));
      const wrap=document.createElement("label");
      wrap.innerHTML=`
        Região
        <select id="region">
          <option value="">Todas as regiões</option>
          <option value="Norte">Norte</option>
          <option value="Nordeste">Nordeste</option>
          <option value="Centro-Oeste">Centro-Oeste</option>
          <option value="Sudeste">Sudeste</option>
          <option value="Sul">Sul</option>
        </select>
      `;
      if(ufLabel)filters.insertBefore(wrap,ufLabel);
      else filters.appendChild(wrap);
    }

    if(!document.getElementById("map-class")){
      const block=document.createElement("div");
      block.className="filter-extra-block";
      block.innerHTML=`
        <label>
          Classificação do mapa
          <select id="map-class">
            <option value="equal">Intervalos iguais</option>
            <option value="quantile">Quantis</option>
            <option value="log">Logarítmica</option>
          </select>
        </label>

        <label>
          Indicador do mapa
          <div class="segmented">
            <button type="button" id="seg-casos" data-indicator="casos">Casos</button>
            <button type="button" id="seg-inc" data-indicator="incidencia_100mil">Incidência</button>
          </div>
        </label>
      `;

      const note=filters.querySelector(".note");
      if(note)filters.insertBefore(block,note);
      else filters.appendChild(block);
    }
  }

  function lepEnsureCards(){
    const cards=document.querySelector(".cards");
    if(!cards)return;

    const extras=[
      ["card-periodo","Período selecionado"],
      ["card-ufs","UFs com notificações"],
      ["card-cobertura","Cobertura populacional"],
      ["card-tendencia","Tendência temporal"]
    ];

    for(const [id,label] of extras){
      if(!document.getElementById(id)){
        const card=document.createElement("article");
        card.className="card";
        card.innerHTML=`<span>${label}</span><strong id="${id}">—</strong>`;
        cards.appendChild(card);
      }
    }
  }

  function lepEnsureMapTools(){
    const mapUf=document.getElementById("map-uf");
    const mapMun=document.getElementById("map-mun");

    if(mapUf&&!document.getElementById("download-map-uf-clean")){
      const panel=mapUf.closest(".panel");
      const toolbar=document.createElement("div");
      toolbar.className="map-toolbar";
      toolbar.innerHTML=`
        <button id="download-map-uf-clean" type="button" class="download-btn secondary-download">Baixar mapa UF limpo</button>
      `;
      panel.insertBefore(toolbar,mapUf);

      if(!mapUf.closest(".map-box")){
        const box=document.createElement("div");
        box.className="map-box";
        mapUf.parentNode.insertBefore(box,mapUf);
        box.appendChild(mapUf);

        const legend=document.createElement("div");
        legend.id="legend-map-uf";
        legend.className="map-legend";
        box.appendChild(legend);
      }
    }

    if(mapMun&&!document.getElementById("download-map-mun-clean")){
      const panel=mapMun.closest(".panel");
      const toolbar=document.createElement("div");
      toolbar.className="map-toolbar";
      toolbar.innerHTML=`
        <button id="download-map-mun-clean" type="button" class="download-btn secondary-download">Baixar mapa municipal limpo</button>
      `;
      panel.insertBefore(toolbar,mapMun);

      if(!mapMun.closest(".map-box")){
        const box=document.createElement("div");
        box.className="map-box";
        mapMun.parentNode.insertBefore(box,mapMun);
        box.appendChild(mapMun);

        const legend=document.createElement("div");
        legend.id="legend-map-mun";
        legend.className="map-legend";
        box.appendChild(legend);
      }
    }
  }

  function lepEnsureTableNote(){
    const table=document.getElementById("table");
    if(!table)return;
    const wrap=table.closest(".panel");
    if(wrap&&!document.getElementById("table-pop-note")){
      const p=document.createElement("p");
      p.id="table-pop-note";
      p.className="table-note";
      p.innerHTML="Nota: a população-ano pode incluir valores interpolados ou extrapolados quando não há valor exato para o município-ano.";
      wrap.appendChild(p);
    }
  }

  function lepEnsureFooter(){
    const footer=document.querySelector("footer");
    if(!footer)return;

    footer.innerHTML=`
      <strong>LEPRECHAS — Painel Epidemiológico Brasileiro</strong><br>
      Dados agregados: SINAN/DATASUS | População: IBGE/SIDRA | Malhas territoriais: GeoJSON<br>
      Protótipo técnico-científico para visualização epidemiológica exploratória. Não substitui sistemas oficiais de vigilância.
    `;
  }

  function lepEnsureModal(){
    if(document.getElementById("lep-about-modal"))return;

    document.body.insertAdjacentHTML("beforeend",`
      <section id="lep-about-modal" class="lep-modal">
        <div class="lep-modal-card">
          <div class="lep-kicker">Sobre o painel</div>
          <h1>LEPRECHAS — Painel Epidemiológico Brasileiro</h1>
          <p>
            O LEPRECHAS é um painel estático para visualização exploratória de doenças e agravos notificados,
            com dados agregados por município, Unidade Federativa, ano e período selecionado.
          </p>

          <div class="lep-modal-grid">
            <div class="lep-modal-box">
              <h3>Fontes dos dados</h3>
              <ul>
                <li>Casos agregados: SINAN/DATASUS, exportados via TABNET.</li>
                <li>População municipal: IBGE/SIDRA.</li>
                <li>Malhas territoriais: arquivos GeoJSON de UFs e municípios.</li>
              </ul>
            </div>

            <div class="lep-modal-box">
              <h3>Indicadores</h3>
              <ul>
                <li>Casos no ano ou período selecionado.</li>
                <li>População-ano.</li>
                <li>Incidência por 100 mil habitantes.</li>
                <li>Municípios e UFs com notificações.</li>
                <li>Cobertura populacional da seleção.</li>
              </ul>
            </div>

            <div class="lep-modal-box">
              <h3>Metodologia</h3>
              <ul>
                <li>Os dados são agregados por município-ano.</li>
                <li>Para múltiplos anos, casos e populações-ano são somados.</li>
                <li>A incidência é calculada por: casos / população × 100.000.</li>
                <li>Valores populacionais ausentes podem ser estimados por interpolação ou extrapolação.</li>
              </ul>
            </div>
          </div>

          <h2>Interpretação</h2>
          <p>
            O painel é exploratório. Os resultados devem ser interpretados considerando cobertura da vigilância,
            atraso de notificação, revisão das bases, alterações territoriais, variações diagnósticas e instabilidade
            de taxas em municípios de pequena população.
          </p>

          <h2>Como citar</h2>
          <div id="lep-citation" class="lep-citation">
            Barelli, V. E. G. LEPRECHAS: Painel Epidemiológico Brasileiro. Disponível em:
            https://leprechas.github.io/epibrasil-painel/. Acesso em: dia mês ano.
          </div>

          <div class="lep-modal-actions">
            <button id="copy-citation" type="button">Copiar citação</button>
            <button id="close-about-modal" type="button" class="secondary">Fechar</button>
          </div>
        </div>
      </section>
    `);
  }

  function lepOpenModal(){
    const modal=document.getElementById("lep-about-modal");
    if(modal)modal.classList.add("open");
  }

  function lepCloseModal(){
    const modal=document.getElementById("lep-about-modal");
    if(modal)modal.classList.remove("open");
  }

  function lepGetRegionFilteredData(ignoreUfMun=false){
    const years=typeof selectedYears==="function" ? selectedYears() : [];
    const region=lepSelectedRegion();
    const uf=document.getElementById("uf")?.value||"";
    const mun=document.getElementById("mun")?.value.trim()||"";

    return (window.DATA||DATA||[]).filter(r=>{
      const yearOk=years.length===0||years.includes(r.ano);
      const regionOk=!region||lepRegionOfUF(r.uf)===region;
      const ufOk=ignoreUfMun||!uf||r.uf===uf;
      const munOk=ignoreUfMun||!mun||r.municipio===mun;
      return yearOk&&regionOk&&ufOk&&munOk;
    });
  }

  function lepMakeBreaks(values,method){
    const vals=values
      .map(Number)
      .filter(v=>Number.isFinite(v)&&v>0)
      .sort((a,b)=>a-b);

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
      for(let i=1;i<=5;i++){
        out.push(Math.pow(10,logMin+(logMax-logMin)*i/5));
      }
      return out;
    }

    return [max*.2,max*.4,max*.6,max*.8,max];
  }

  function lepColorFromBreaks(v,breaks){
    v=Number(v);
    if(!Number.isFinite(v)||v<=0||!breaks)return "#f1f5f9";
    if(v<=breaks[0])return LEP_COLORS[0];
    if(v<=breaks[1])return LEP_COLORS[1];
    if(v<=breaks[2])return LEP_COLORS[2];
    if(v<=breaks[3])return LEP_COLORS[3];
    return LEP_COLORS[4];
  }

  window.color=function(v,max){
    const breaks=
      LEP_BREAKS.uf&&Math.abs((LEP_BREAKS.uf.max||0)-(max||0))<1e-9 ? LEP_BREAKS.uf.breaks :
      LEP_BREAKS.mun&&Math.abs((LEP_BREAKS.mun.max||0)-(max||0))<1e-9 ? LEP_BREAKS.mun.breaks :
      lepMakeBreaks([max],"equal");

    return lepColorFromBreaks(v,breaks);
  };

  function lepPrepareBreaks(rows){
    if(typeof group!=="function")return;
    const ind=document.getElementById("indicator")?.value||"casos";
    const method=document.getElementById("map-class")?.value||"equal";

    const ufRows=group(rows,["uf"]).filter(r=>r.uf);
    const munRows=group(rows,["uf","cod_mun6","municipio"]);

    const ufValues=ufRows.map(r=>Number(r[ind]||0));
    const munValues=munRows.map(r=>Number(r[ind]||0));

    const maxUF=Math.max(0,...ufValues);
    const maxMun=Math.max(0,...munValues);

    LEP_BREAKS={
      uf:{max:maxUF,breaks:lepMakeBreaks(ufValues,method),values:ufValues},
      mun:{max:maxMun,breaks:lepMakeBreaks(munValues,method),values:munValues}
    };
  }

  function lepLegendHTML(title,breaksObj){
    const method=document.getElementById("map-class")?.selectedOptions?.[0]?.textContent||"Intervalos iguais";
    const ind=lepIndicatorLabel();

    if(!breaksObj||!breaksObj.breaks){
      return `
        <strong>${title}</strong>
        <div style="margin-bottom:6px;color:#64748b">${ind}</div>
        <div class="legend-row"><span class="legend-swatch" style="background:#f1f5f9"></span><span>Sem notificação</span></div>
      `;
    }

    const b=breaksObj.breaks;

    const rows=[
      {label:`${lepFmt(b[3])} – ${lepFmt(b[4])}`,color:LEP_COLORS[4]},
      {label:`${lepFmt(b[2])} – ${lepFmt(b[3])}`,color:LEP_COLORS[3]},
      {label:`${lepFmt(b[1])} – ${lepFmt(b[2])}`,color:LEP_COLORS[2]},
      {label:`${lepFmt(b[0])} – ${lepFmt(b[1])}`,color:LEP_COLORS[1]},
      {label:`> 0 – ${lepFmt(b[0])}`,color:LEP_COLORS[0]},
      {label:"Sem notificação",color:"#f1f5f9"}
    ];

    return `
      <strong>${title}</strong>
      <div style="margin-bottom:6px;color:#64748b">${ind}</div>
      <div style="margin-bottom:6px;color:#64748b">Classificação: ${method}</div>
      ${rows.map(r=>`
        <div class="legend-row">
          <span class="legend-swatch" style="background:${r.color}"></span>
          <span>${r.label}</span>
        </div>
      `).join("")}
    `;
  }

  function lepUpdateLegends(){
    const uf=document.getElementById("legend-map-uf");
    const mun=document.getElementById("legend-map-mun");

    if(uf)uf.innerHTML=lepLegendHTML("Legenda — UFs",LEP_BREAKS.uf);
    if(mun)mun.innerHTML=lepLegendHTML("Legenda — municípios",LEP_BREAKS.mun);
  }

  function lepUpdateExtraCards(){
    if(typeof group!=="function")return;

    const rows=typeof filtered==="function" ? filtered(false) : lepGetRegionFilteredData(false);
    const ind=document.getElementById("indicator")?.value||"casos";

    const ufRows=group(rows,["uf"]).filter(r=>r.uf&&(r.casos||0)>0);
    const munRows=group(rows,["uf","cod_mun6","municipio"]).filter(r=>(r.casos||0)>0);
    const munWithPop=munRows.filter(r=>Number.isFinite(r.populacao)&&r.populacao>0);

    const periodo=document.getElementById("card-periodo");
    const ufs=document.getElementById("card-ufs");
    const cobertura=document.getElementById("card-cobertura");
    const tendencia=document.getElementById("card-tendencia");

    if(periodo)periodo.textContent=lepYearsLabel();
    if(ufs)ufs.textContent=fmt.format(ufRows.length);

    if(cobertura){
      const pct=munRows.length ? munWithPop.length/munRows.length*100 : 0;
      cobertura.textContent=`${lepFmt(pct,1)}%`;
    }

    if(tendencia){
      const serie=group(rows,["ano"]).sort((a,b)=>a.ano-b.ano);
      if(serie.length<2){
        tendencia.textContent="—";
      }else{
        const first=serie[0].casos||0;
        const last=serie.at(-1).casos||0;
        if(first===0&&last>0)tendencia.textContent="Emergente";
        else if(first===0&&last===0)tendencia.textContent="Estável";
        else{
          const delta=(last-first)/first*100;
          if(delta>10)tendencia.textContent=`Alta ${lepFmt(delta,1)}%`;
          else if(delta<-10)tendencia.textContent=`Queda ${lepFmt(Math.abs(delta),1)}%`;
          else tendencia.textContent="Estável";
        }
      }
    }

    document.querySelectorAll(".segmented button").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.indicator===ind);
    });
  }

  function lepPatchFilters(){
    if(typeof filtered==="function"&&!window.LEP_FILTER_PATCHED){
      window.LEP_FILTER_PATCHED=true;

      window.filtered=function(ignoreYear=false){
        const years=typeof selectedYears==="function" ? selectedYears() : [];
        const region=lepSelectedRegion();
        const uf=document.getElementById("uf")?.value||"";
        const mun=document.getElementById("mun")?.value.trim()||"";

        return (window.DATA||DATA||[]).filter(r=>{
          const yearOk=ignoreYear||years.length===0||years.includes(r.ano);
          const regionOk=!region||lepRegionOfUF(r.uf)===region;
          const ufOk=!uf||r.uf===uf;
          const munOk=!mun||r.municipio===mun;
          return yearOk&&regionOk&&ufOk&&munOk;
        });
      };
    }

    if(typeof rowsForSelectedYearsNoGeoFilters==="function"&&!window.LEP_RANKING_PATCHED){
      window.LEP_RANKING_PATCHED=true;

      window.rowsForSelectedYearsNoGeoFilters=function(){
        const years=typeof selectedYears==="function" ? selectedYears() : [];
        const region=lepSelectedRegion();

        return (window.DATA||DATA||[]).filter(r=>{
          const yearOk=years.length===0||years.includes(r.ano);
          const regionOk=!region||lepRegionOfUF(r.uf)===region;
          return yearOk&&regionOk;
        });
      };
    }
  }

  function lepPatchRenderMaps(){
    if(typeof renderMaps==="function"&&!window.LEP_RENDER_PATCHED){
      window.LEP_RENDER_PATCHED=true;
      const originalRenderMaps=renderMaps;

      window.renderMaps=function(rows){
        lepPrepareBreaks(rows);
        originalRenderMaps(rows);
        setTimeout(lepUpdateLegends,120);
      };
    }
  }

  function lepPatchRefresh(){
    if(typeof refresh==="function"&&!window.LEP_REFRESH_PATCHED){
      window.LEP_REFRESH_PATCHED=true;
      const originalRefresh=refresh;

      window.refresh=function(){
        originalRefresh();
        setTimeout(()=>{
          lepUpdateExtraCards();
          lepUpdateLegends();
        },160);
      };
    }
  }

  function lepDownloadFilteredCSV(){
    if(typeof filtered!=="function"){
      alert("Filtro ainda não carregado.");
      return;
    }

    const rows=filtered(false);
    const headers=[
      "doenca","doenca_nome","cod_mun6","municipio","uf","ano",
      "casos","populacao","incidencia_100mil"
    ];

    const csv=[
      headers.join(","),
      ...rows.map(r=>headers.map(h=>lepCsvEscape(
        h==="incidencia_100mil"&&Number.isFinite(r[h]) ? r[h].toFixed(6) : r[h]
      )).join(","))
    ].join("\n");

    const disease=document.getElementById("disease")?.value||"doenca";
    const years=lepYearsLabel().replaceAll(" ","_").replaceAll(",","-");
    lepDownloadText(csv,`leprechas_${disease}_${years}_filtrado.csv`,"text/csv;charset=utf-8");
  }

  function lepDownloadText(content,filename,type){
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

  function lepFeatureCoords(geometry){
    if(!geometry)return [];
    if(geometry.type==="Polygon")return geometry.coordinates;
    if(geometry.type==="MultiPolygon")return geometry.coordinates.flat();
    return [];
  }

  function lepAllCoords(features){
    const coords=[];
    for(const f of features){
      for(const ring of lepFeatureCoords(f.geometry)){
        for(const c of ring){
          if(Array.isArray(c)&&c.length>=2)coords.push(c);
        }
      }
    }
    return coords;
  }

  function lepSvgEscape(s){
    return String(s??"").replace(/[&<>"']/g,m=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function lepBuildCleanMapSVG(kind){
    const isUF=kind==="uf";
    const geo=isUF ? GEO_UF : GEO_MUN;

    if(!geo||!geo.features){
      alert("GeoJSON não carregado.");
      return null;
    }

    const rows=typeof filtered==="function" ? filtered(false) : [];
    const ind=document.getElementById("indicator")?.value||"casos";
    const grouped=isUF ? group(rows,["uf"]) : group(rows,["uf","cod_mun6","municipio"]);
    const values=grouped.map(r=>Number(r[ind]||0));
    const method=document.getElementById("map-class")?.value||"equal";
    const breaks=lepMakeBreaks(values,method);

    const byKey=new Map();
    for(const r of grouped){
      byKey.set(isUF ? r.uf : r.cod_mun6,r);
    }

    const features=geo.features;
    const coords=lepAllCoords(features);

    if(coords.length===0){
      alert("Coordenadas do mapa não encontradas.");
      return null;
    }

    let minX=Math.min(...coords.map(c=>c[0]));
    let maxX=Math.max(...coords.map(c=>c[0]));
    let minY=Math.min(...coords.map(c=>c[1]));
    let maxY=Math.max(...coords.map(c=>c[1]));

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

    const pathFromFeature=f=>{
      return lepFeatureCoords(f.geometry).map(ring=>{
        return ring.map((c,i)=>{
          const [x,y]=project(c);
          return `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ")+" Z";
      }).join(" ");
    };

    const getKey=f=>{
      if(isUF){
        return typeof getUFCode==="function" ? getUFCode(f) : "";
      }
      return typeof getMunCode==="function" ? getMunCode(f) : "";
    };

    const paths=features.map(f=>{
      const key=getKey(f);
      const row=byKey.get(key);
      const value=row ? Number(row[ind]||0) : 0;
      const fill=lepColorFromBreaks(value,breaks);
      const stroke=isUF ? "#475569" : "#94a3b8";
      const strokeWidth=isUF ? "1.4" : ".35";
      return `<path d="${pathFromFeature(f)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    }).join("\n");

    const title=`${lepDiseaseLabel()} — ${lepIndicatorLabel()}`;
    const subtitle=`${isUF?"Mapa das UFs":"Mapa municipal"} | ${lepYearsLabel()} | Fonte: SINAN/DATASUS; população: IBGE/SIDRA`;
    const methodLabel=document.getElementById("map-class")?.selectedOptions?.[0]?.textContent||"Intervalos iguais";

    let legend="";
    if(breaks){
      const legendRows=[
        {label:`${lepFmt(breaks[3])} – ${lepFmt(breaks[4])}`,color:LEP_COLORS[4]},
        {label:`${lepFmt(breaks[2])} – ${lepFmt(breaks[3])}`,color:LEP_COLORS[3]},
        {label:`${lepFmt(breaks[1])} – ${lepFmt(breaks[2])}`,color:LEP_COLORS[2]},
        {label:`${lepFmt(breaks[0])} – ${lepFmt(breaks[1])}`,color:LEP_COLORS[1]},
        {label:`> 0 – ${lepFmt(breaks[0])}`,color:LEP_COLORS[0]},
        {label:"Sem notificação",color:"#f1f5f9"}
      ];

      legend=legendRows.map((r,i)=>`
        <rect x="${legendX}" y="${legendY+90+i*44}" width="30" height="22" rx="5" fill="${r.color}" stroke="#cbd5e1"/>
        <text x="${legendX+46}" y="${legendY+107+i*44}" font-size="24" fill="#1e293b">${lepSvgEscape(r.label)}</text>
      `).join("");
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="70" y="70" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#0f172a">${lepSvgEscape(title)}</text>
        <text x="70" y="112" font-family="Arial, sans-serif" font-size="22" fill="#475569">${lepSvgEscape(subtitle)}</text>

        <g>
          ${paths}
        </g>

        <rect x="${legendX-32}" y="${legendY-54}" width="350" height="390" rx="24" fill="#ffffff" stroke="#cbd5e1"/>
        <text x="${legendX}" y="${legendY}" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#0f172a">Legenda</text>
        <text x="${legendX}" y="${legendY+38}" font-family="Arial, sans-serif" font-size="20" fill="#64748b">${lepSvgEscape(lepIndicatorLabel())}</text>
        <text x="${legendX}" y="${legendY+66}" font-family="Arial, sans-serif" font-size="18" fill="#64748b">Classificação: ${lepSvgEscape(methodLabel)}</text>
        ${legend}

        <text x="70" y="1060" font-family="Arial, sans-serif" font-size="18" fill="#64748b">
          LEPRECHAS — Painel Epidemiológico Brasileiro. Uso exploratório; não substitui sistemas oficiais de vigilância.
        </text>
      </svg>
    `;
  }

  function lepDownloadCleanMap(kind){
    const svg=lepBuildCleanMapSVG(kind);
    if(!svg)return;

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
        const a=document.createElement("a");
        const disease=(document.getElementById("disease")?.value||"doenca").toLowerCase();
        const years=lepYearsLabel().replaceAll(" ","_").replaceAll(",","-");
        a.href=URL.createObjectURL(blob);
        a.download=`leprechas_mapa_${kind}_${disease}_${years}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },"image/png");
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      lepDownloadText(svg,`leprechas_mapa_${kind}.svg`,"image/svg+xml;charset=utf-8");
    };

    img.src=url;
  }

  window.epiDownloadMap=function(mapId,filename){
    lepDownloadCleanMap(mapId==="map-uf" ? "uf" : "mun");
  };

  function lepSetup(){
    lepEnsureHeader();
    lepEnsureFilters();
    lepEnsureCards();
    lepEnsureMapTools();
    lepEnsureTableNote();
    lepEnsureFooter();
    lepEnsureModal();
    lepPatchFilters();
    lepPatchRenderMaps();
    lepPatchRefresh();

    setTimeout(()=>{
      lepUpdateExtraCards();
      lepUpdateLegends();
    },700);
  }

  document.addEventListener("click",e=>{
    const id=e.target?.id;

    if(id==="about-panel-btn"){
      lepOpenModal();
    }

    if(id==="close-about-modal"){
      lepCloseModal();
    }

    if(id==="copy-citation"){
      const txt=document.getElementById("lep-citation")?.textContent.trim()||"";
      navigator.clipboard?.writeText(txt);
    }

    if(id==="download-csv"){
      lepDownloadFilteredCSV();
    }

    if(id==="download-map-uf-clean"){
      lepDownloadCleanMap("uf");
    }

    if(id==="download-map-mun-clean"){
      lepDownloadCleanMap("mun");
    }

    if(e.target?.dataset?.indicator){
      const ind=e.target.dataset.indicator;
      const select=document.getElementById("indicator");
      if(select){
        select.value=ind;
        if(typeof refresh==="function")refresh();
      }
    }
  });

  document.addEventListener("change",e=>{
    if(["region","map-class"].includes(e.target?.id)){
      const uf=document.getElementById("uf");
      const mun=document.getElementById("mun");
      if(e.target.id==="region"){
        if(uf)uf.value="";
        if(mun)mun.value="";
      }
      if(typeof refresh==="function")refresh();
    }
  });

  setTimeout(lepSetup,100);
  setTimeout(lepSetup,1200);
}
