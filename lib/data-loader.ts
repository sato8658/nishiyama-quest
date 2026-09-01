export type OpenRow = Record<string, unknown>;
export type GeoRecord = { id:string; name:string; latitude:number|null; longitude:number|null; address?:string; source:string };
export type RedPanda = GeoRecord & { gender:string; birthDate:string; birthplace:string; profile:string };
export type RedPandaIndividual = { name:string; gender:string; birthDate:string; deathDate:string; age:string; destination:string; remarks:string };
export type VisitorFlow = { startDate:string; endDate:string; dayType:string; rank:number; municipality:string; area:string; ratio:number };
export type NormalizedOpenData = {
  publicToilets:GeoRecord[]; parking:GeoRecord[]; busStops:GeoRecord[];
  redPandas:RedPanda[]; redPandaIndividuals:RedPandaIndividual[]; visitorFlow:VisitorFlow[];
  counts:Record<string,number>;
};

const text=(row:OpenRow,...keys:string[])=>{for(const key of keys){const value=row[key];if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim()}return ''};
const number=(row:OpenRow,...keys:string[])=>{const value=Number(text(row,...keys));return Number.isFinite(value)?value:null};

// Older Sabae datasets may express 35°57′24″ as 35.5724. Convert only values
// outside the plausible Sabae decimal-degree range, preserving ordinary WGS84 values.
export function normalizeCoordinate(value:number|null, axis:'lat'|'lng') {
  if(value===null)return null;
  const plausible=axis==='lat'?(value>=35.7&&value<=36.2):(value>=135.8&&value<=136.5);
  if(plausible)return value;
  const degrees=Math.trunc(value), packed=(value-degrees)*100, minutes=Math.trunc(packed), seconds=(packed-minutes)*100;
  const converted=degrees+minutes/60+seconds/3600;
  const valid=axis==='lat'?(converted>=35.7&&converted<=36.2):(converted>=135.8&&converted<=136.5);
  return valid?converted:null;
}

const geo=(rows:OpenRow[], kind:string):GeoRecord[]=>rows.map((row,index)=>({
  id:text(row,'施設ID','バス停ID','ID')||`${kind}-${index+1}`,
  name:text(row,'施設名','バス停名称','名前','name'),
  latitude:normalizeCoordinate(number(row,'緯度','latitude','lat'),'lat'),
  longitude:normalizeCoordinate(number(row,'経度','longitude','lng','lon'),'lng'),
  address:text(row,'住所','所在地','address'), source:kind,
})).filter(row=>row.name);

export function normalizeOpenData(raw:Record<string,OpenRow[]>):NormalizedOpenData {
  const publicToilets=geo(raw.publicToilets||[],'public_toilets');
  const parking=geo(raw.parking||[],'parking');
  const busStops=geo(raw.busStops||[],'bus_stops');
  const redPandas:RedPanda[]=(raw.redPandas||[]).map((row,index)=>({
    ...geo([row],`red_panda-${index+1}`)[0],
    id:`red-panda-${index+1}`, gender:text(row,'性別','sex'), birthDate:text(row,'生年月日','誕生日','birthDate'),
    birthplace:text(row,'出生地','birthplace'), profile:text(row,'備考','プロフィール','profile'), source:'red_pandas',
  })).filter(row=>row?.name);
  const visitorFlow=(raw.visitorFlow||[]).map(row=>({
    startDate:text(row,'開始日'),endDate:text(row,'終了日'),dayType:text(row,'休日・平日'),rank:Number(text(row,'順位'))||0,
    municipality:text(row,'市区町村'),area:text(row,'エリア名'),ratio:(Number(text(row,'来訪者割合').replace('%',''))||0)/100,
  })).filter(row=>row.municipality);
  const redPandaIndividuals=(raw.redPandaIndividuals||[]).map(row=>({name:text(row,'個体名'),gender:text(row,'性別'),birthDate:text(row,'生年月日'),deathDate:text(row,'死亡年月日'),age:text(row,'年齢'),destination:text(row,'移動先動物園'),remarks:text(row,'備考')})).filter(row=>row.name);
  return {publicToilets,parking,busStops,redPandas,redPandaIndividuals,visitorFlow,
    counts:{publicToilets:publicToilets.length,parking:parking.length,busStops:busStops.length,redPandas:redPandas.length,redPandaIndividuals:(raw.redPandaIndividuals||[]).length,visitorFlow:visitorFlow.length}};
}

export function parseCsv(textValue:string):OpenRow[]{
  const lines=textValue.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];
  const split=(line:string)=>line.match(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)?.map(v=>v.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"'))??[];
  const headers=split(lines[0]);return lines.slice(1).map(line=>Object.fromEntries(split(line).map((value,index)=>[headers[index]??`column_${index}`,value])));
}
