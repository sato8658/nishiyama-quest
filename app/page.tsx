'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import rawOpenData from '../data/open-data.raw.json';
import { normalizeOpenData } from '../lib/data-loader';
import { generateRoute, routeTitle, Spot } from '../lib/route-engine';
import QuestMap, { MapPoint } from '../components/QuestMap';
import { redPandaPhotoPlaceholder, redPandaPhotoRecords } from '../lib/red-panda-images';

const transports = ['車', '電車＋徒歩', 'バス', '徒歩'];
const companions = ['ひとり', 'カップル', '家族', '友達', 'シニア'];
const durations = ['30分', '60分', '90分', '120分以上'];
const interests = ['レッサーパンダ', '自然', '写真', '散策', 'ゲーム', 'のんびり'];
const emptyMapPoints: MapPoint[] = [];
const titleStorageKey = 'nishiyamaQuest.earnedTitles.v1';
const progressStorageKey = 'nishiyamaQuest.adventureProgress.v1';
const allTitles = ['西山公園ビギナー','西山公園冒険家','西山公園マスター','レッサーパンダ博士','西山フォトマスター'];
const transportMarks = ['P', '駅', 'BUS', '歩'];
const anchorType = (name:string) => name.includes('八角') ? '場所探し' : name.includes('冒険の森') ? '散策' : name.includes('庭園') ? '季節' : name.includes('広場') ? '写真' : '散策';
const anchorInterests = (type:string) => type === '場所探し' ? ['ゲーム','散策'] : type === '季節' ? ['自然','のんびり'] : type === '写真' ? ['写真','自然'] : ['散策','自然'];
type Screen = 'top'|'transport'|'settings'|'route'|'map'|'quest'|'location'|'complete'|'data';
type EarnedTitle = { title:string; firstEarnedAt:string };
type FeatureNotice = { title:string; text:string; kind?:'titles'; actionLabel?:string; action?:()=>void };
type AdventureProgress = {version:1;status:'active';currentQuest:number;completedQuestIds:string[];points:number;transport:string;companion:string;duration:string;interests:string[];routeIds:string[];foundRedPandas:string[];titleCandidate:string;updatedAt:string};

const resolveTitle=(selectedInterests:string[],completedCount:number)=>selectedInterests.includes('レッサーパンダ')&&completedCount>=4?'レッサーパンダ博士':selectedInterests.includes('写真')&&completedCount>=4?'西山フォトマスター':completedCount>=5?'西山公園マスター':completedCount>=3?'西山公園冒険家':'西山公園ビギナー';

const questImageCandidates:Record<string,string[]>={
  map:['/assets/quest/map-quest.png'],
  discovery:['/assets/quest/discovery-quest.png'],
  hint:['/assets/quest/hint-quest.png'],
};
const questImageCategory=(type:string)=>['ゲーム','ヒント','クイズ'].some(word=>type.includes(word))?'hint':['写真','自然','季節','展望','発見'].some(word=>type.includes(word))?'discovery':'map';
const questImageFor=(spot:Spot)=>spot.type==='レッサーパンダ'?null:questImageCandidates[questImageCategory(spot.type)][0];
const questInstruction=(type:string)=>type==='写真'?'ここで今日のベストショットを撮ろう。':type==='季節'||type==='自然'?'季節を感じるものを1つ探してみよう。':type==='展望'||type==='景色'?'ここから見えるお気に入りの景色を探そう。':type==='場所探し'?'地図を手がかりに目的地へたどり着こう。':'この場所でお気に入りの景色を1つ見つけよう。';

const distance = (a:{lat:number,lng:number}, b:{lat:number,lng:number}) => {
  const r=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;
  return 2*r*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2));
};
const formatOpenDate=(value:string)=>value.split('T')[0].replace(/\s+0:00(?::00)?$/,'');

function Guide({label}:{label?:string}) {
  return <div className="guide-character"><img src="/assets/explorer-red-panda.png" alt="探検家レッサーパンダの案内役"/>{label&&<small>{label}</small>}</div>;
}

function ScenicHeader({eyebrow,title,lead,label}:{eyebrow:string,title:string,lead?:string,label?:string}) {
  return <div className="scenic-header"><img className="scenic-bg" src="/assets/park-background.png" alt=""/><div className="scenic-shade"/><div className="scenic-copy"><p className="step-count">{eyebrow}</p><h2>{title}</h2>{lead&&<p>{lead}</p>}</div><Guide label={label}/></div>;
}

function Stepper({active}:{active:1|2|3}) {
  return <div className="stepper" aria-label={`設定ステップ${active}`}>
    {['交通手段','設定','ルート結果'].map((label,index)=><span key={label} className={active===index+1?'active':active>index+1?'done':''}><b>{index+1}</b>{label}</span>)}
  </div>;
}

export default function Home() {
  const [screen,setScreen]=useState<Screen>('top');
  const [transport,setTransport]=useState('');
  const [companion,setCompanion]=useState('');
  const [duration,setDuration]=useState('');
  const [chosen,setChosen]=useState<string[]>([]);
  const [demo,setDemo]=useState(false);
  const [current,setCurrent]=useState(0);
  const [done,setDone]=useState<string[]>([]);
  const [points,setPoints]=useState(0);
  const [gps,setGps]=useState<{lat:number,lng:number}|null>(null);
  const [gpsAccuracy,setGpsAccuracy]=useState<number|null>(null);
  const [message,setMessage]=useState('');
  const [cardSaveMessage,setCardSaveMessage]=useState('');
  const [foundPanda,setFoundPanda]=useState('');
  const [foundRedPandas,setFoundRedPandas]=useState<string[]>([]);
  const [toiletOpen,setToiletOpen]=useState(false);
  const [selectedToiletId,setSelectedToiletId]=useState('');
  const [screenBeforeToilet,setScreenBeforeToilet]=useState<Screen>('top');
  const [routeReady,setRouteReady]=useState(false);
  const [savedRouteIds,setSavedRouteIds]=useState<string[]>([]);
  const [progressLoaded,setProgressLoaded]=useState(false);
  const [hasSavedAdventure,setHasSavedAdventure]=useState(false);
  const [featureNotice,setFeatureNotice]=useState<FeatureNotice|null>(null);
  const [earnedTitles,setEarnedTitles]=useState<EarnedTitle[]>([]);
  const [titleHistoryLoaded,setTitleHistoryLoaded]=useState(false);
  const cardRef=useRef<HTMLDivElement>(null);

  const openData=useMemo(()=>normalizeOpenData(rawOpenData),[]);
  const visibleRedPandas=useMemo(()=>openData.redPandas.map(panda=>({name:panda.name,photo:redPandaPhotoRecords.find(photo=>photo.name===panda.name)})),[openData]);
  const realSpots=useMemo<Spot[]>(()=>{
    const anchors=openData.publicToilets
      .filter(item=>item.name.startsWith('西山公園(')&&!item.name.includes('西山動物園'))
      .map((item,index)=>{const type=anchorType(item.name);return{id:`park-${index+1}`,name:item.name,type,minutes:15,interests:anchorInterests(type),lat:item.latitude??undefined,lng:item.longitude??undefined};});
    const pandaLocation=openData.redPandas.find(panda=>panda.latitude!==null&&panda.longitude!==null);
    const pandaQuest:Spot[]=pandaLocation?[{id:'red-panda-observation',name:'レッサーパンダ観察QUEST',description:'何頭のレッサーパンダに会えるかな？',type:'レッサーパンダ',minutes:20,interests:['レッサーパンダ','ゲーム'],lat:pandaLocation.latitude!,lng:pandaLocation.longitude!}]:[];
    return [...anchors,...pandaQuest];
  },[openData]);
  const generatedRoute=useMemo(()=>generateRoute({transport,companion,duration,interests:chosen},realSpots),[transport,companion,duration,chosen,realSpots]);
  const route=useMemo(()=>savedRouteIds.length?savedRouteIds.map(id=>realSpots.find(spot=>spot.id===id)).filter((spot):spot is Spot=>Boolean(spot)):generatedRoute,[savedRouteIds,realSpots,generatedRoute]);
  const active=route[current];
  const activeQuestImage=active?questImageFor(active):null;
  const selectedPanda=openData.redPandas.find(panda=>panda.name===foundPanda);
  const selectedPandaIndividual=openData.redPandaIndividuals.find(panda=>panda.name===foundPanda);
  const selectedPandaRecord=visibleRedPandas.find(panda=>panda.name===foundPanda);
  const selectedPandaBirthDate=selectedPanda?.birthDate||selectedPandaIndividual?.birthDate||'';
  const routeAnchor=route.find((spot):spot is Spot&{lat:number;lng:number}=>typeof spot.lat==='number'&&typeof spot.lng==='number')??realSpots.find((spot):spot is Spot&{lat:number;lng:number}=>typeof spot.lat==='number'&&typeof spot.lng==='number');
  const nearestToRoute=<T extends {latitude:number|null;longitude:number|null}>(items:T[])=>routeAnchor?[...items].filter((item):item is T&{latitude:number;longitude:number}=>item.latitude!==null&&item.longitude!==null).sort((a,b)=>distance({lat:routeAnchor.lat,lng:routeAnchor.lng},{lat:a.latitude,lng:a.longitude})-distance({lat:routeAnchor.lat,lng:routeAnchor.lng},{lat:b.latitude,lng:b.longitude}))[0]??null:null;
  const accessPoint=transport==='車' ? nearestToRoute(openData.parking) : transport==='バス' ? nearestToRoute(openData.busStops) : null;
  const nearbyToilets=useMemo(()=>{const origin=gps??(routeAnchor?{lat:routeAnchor.lat,lng:routeAnchor.lng}:null);return [...openData.publicToilets].sort((a,b)=>origin&&a.latitude!==null&&a.longitude!==null&&b.latitude!==null&&b.longitude!==null ? distance(origin,{lat:a.latitude,lng:a.longitude})-distance(origin,{lat:b.latitude,lng:b.longitude}) : a.name.localeCompare(b.name,'ja'));},[openData,gps,routeAnchor]);
  const mapPoints=useMemo(()=>{
    const valid=(item:{id:string;name:string;latitude:number|null;longitude:number|null}):item is {id:string;name:string;latitude:number;longitude:number}=>item.latitude!==null&&item.longitude!==null;
    const convert=(items:Array<{id:string;name:string;latitude:number|null;longitude:number|null}>):MapPoint[]=>items.filter(valid).filter(item=>!routeAnchor||distance({lat:routeAnchor.lat,lng:routeAnchor.lng},{lat:item.latitude,lng:item.longitude})<=800).map(item=>({id:item.id,name:item.name,latitude:item.latitude,longitude:item.longitude}));
    return {
      quests:route.filter((spot):spot is Spot&{lat:number;lng:number}=>typeof spot.lat==='number'&&typeof spot.lng==='number').map(spot=>({id:spot.id,name:spot.name,latitude:spot.lat,longitude:spot.lng})),
      toilets:convert(openData.publicToilets),parking:convert(openData.parking),busStops:convert(openData.busStops),
    };
  },[route,openData,routeAnchor]);
  const locationQuestPoints=useMemo<MapPoint[]>(()=>active&&typeof active.lat==='number'&&typeof active.lng==='number'?[{id:active.id,name:active.name,latitude:active.lat,longitude:active.lng}]:[],[active]);
  const activeDistance=gps&&active&&typeof active.lat==='number'&&typeof active.lng==='number'?Math.round(distance(gps,{lat:active.lat,lng:active.lng})):null;
  const selectedToilet=openData.publicToilets.find(toilet=>toilet.id===selectedToiletId);
  const selectedToiletPoints=useMemo<MapPoint[]>(()=>selectedToilet&&selectedToilet.latitude!==null&&selectedToilet.longitude!==null?[{id:selectedToilet.id,name:selectedToilet.name,latitude:selectedToilet.latitude,longitude:selectedToilet.longitude}]:[],[selectedToilet]);
  const selectedToiletDistance=gps&&selectedToilet&&selectedToilet.latitude!==null&&selectedToilet.longitude!==null?Math.round(distance(gps,{lat:selectedToilet.latitude,lng:selectedToilet.longitude})):null;

  const nav=(next:Screen)=>{setScreen(next);window.scrollTo(0,0);};
  const openToilet=()=>{setScreenBeforeToilet(screen);setSelectedToiletId('');setToiletOpen(true);window.scrollTo(0,0);};
  const closeToilet=()=>{setToiletOpen(false);setScreen(screenBeforeToilet);window.scrollTo(0,0);};
  const toggle=(value:string)=>setChosen(currentValues=>currentValues.includes(value)?currentValues.filter(item=>item!==value):[...currentValues,value]);
  const locate=()=>navigator.geolocation ? navigator.geolocation.getCurrentPosition(position=>{setGps({lat:position.coords.latitude,lng:position.coords.longitude});setGpsAccuracy(Math.round(position.coords.accuracy));setMessage('現在地を取得しました');},()=>{setGpsAccuracy(null);setMessage('現在地を取得できませんでした。デモモードをご利用ください。');}) : setMessage('このブラウザは現在地取得に対応していません。');
  const selectToilet=(id:string)=>{setSelectedToiletId(id);if(!gps)locate();window.setTimeout(()=>document.getElementById('selected-toilet-map')?.scrollIntoView({behavior:'smooth',block:'start'}),0);};
  const reached=Boolean(demo||(gps&&active?.lat&&active?.lng&&distance(gps,{lat:active.lat,lng:active.lng})<=60));
  const finishQuest=()=>{if(!active||done.includes(active.id))return;const next=[...done,active.id];setDone(next);setPoints(value=>value+100);setMessage('100 POINT GET!');if(next.length===route.length)setTimeout(()=>nav('complete'),650);else setTimeout(()=>{setCurrent(value=>value+1);setFoundPanda('');setMessage('');},650);};
  const markPandaFound=()=>{if(!foundPanda||!reached)return;setFoundRedPandas(currentFound=>currentFound.includes(foundPanda)?currentFound:[...currentFound,foundPanda]);};
  const currentTitle=resolveTitle(chosen,done.length);
  const currentRouteName=routeTitle(companion,chosen);
  const cardDecoration=currentTitle.includes('レッサーパンダ')?'PANDA':currentTitle.includes('フォト')?'PHOTO':currentTitle.includes('マスター')?'MASTER':'QUEST';
  const saveCard=()=>{try{const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const context=canvas.getContext('2d');if(!context)throw new Error('canvas unavailable');const accent=currentTitle.includes('レッサーパンダ')?'#ef7a24':currentTitle.includes('フォト')?'#56a9d6':currentTitle.includes('マスター')?'#e6a915':'#dce94f';context.fillStyle='#123f27';context.fillRect(0,0,1080,1350);context.fillStyle=accent;context.beginPath();context.arc(900,150,92,0,Math.PI*2);context.fill();context.fillStyle='#123f27';context.font='bold 30px Arial';context.textAlign='center';context.fillText(cardDecoration,900,162);context.textAlign='left';context.fillStyle='#dce94f';context.font='bold 72px Arial';context.fillText('NISHIYAMA QUEST',80,150);context.fillStyle='#fff';context.font='bold 92px Arial';context.fillText('QUEST',80,330);context.fillText('COMPLETE!',80,430);context.font='bold 38px Arial';context.fillStyle=accent;context.fillText(currentRouteName,80,540);context.fillStyle='#fff';context.font='44px Arial';context.fillText(`VISITED  ${done.length}`,80,690);context.fillText(`POINTS  ${points}`,80,775);if(foundRedPandas.length)context.fillText(`RED PANDAS  ${foundRedPandas.length}`,80,860);context.fillText(`TITLE  ${currentTitle}`,80,945);context.font='32px Arial';context.fillText(new Date().toLocaleDateString('ja-JP'),80,1180);const link=document.createElement('a');link.download='nishiyama-quest-card.png';link.href=canvas.toDataURL('image/png');document.body.appendChild(link);link.click();link.remove();setCardSaveMessage('画像保存を開始しました。保存されない場合は、画像を長押しして保存してください。');}catch{setCardSaveMessage('画像を保存できませんでした。別のブラウザでお試しください。');}};
  const completeReady=routeReady&&route.length>0&&done.length===route.length;
  const adventureInProgress=routeReady&&route.length>0&&!completeReady;

  useEffect(()=>{
    try{
      const stored=window.localStorage.getItem(titleStorageKey);
      if(stored){
        const parsed:unknown=JSON.parse(stored);
        if(Array.isArray(parsed))setEarnedTitles(parsed.filter((item):item is EarnedTitle=>Boolean(item&&typeof item==='object'&&typeof (item as EarnedTitle).title==='string'&&typeof (item as EarnedTitle).firstEarnedAt==='string')));
      }
    }catch{
      setEarnedTitles([]);
    }finally{
      setTitleHistoryLoaded(true);
    }
  },[]);

  useEffect(()=>{
    try{
      const stored=window.localStorage.getItem(progressStorageKey);
      if(stored){
        const parsed=JSON.parse(stored) as Partial<AdventureProgress>;
        const valid=parsed.version===1&&parsed.status==='active'&&typeof parsed.transport==='string'&&typeof parsed.companion==='string'&&typeof parsed.duration==='string'&&Array.isArray(parsed.interests)&&Array.isArray(parsed.routeIds)&&Array.isArray(parsed.completedQuestIds)&&typeof parsed.currentQuest==='number'&&typeof parsed.points==='number';
        if(valid&&parsed.routeIds!.length){
          const migrateId=(id:string)=>id.startsWith('panda-')?'red-panda-observation':id;
          const availableIds=new Set(realSpots.map(spot=>spot.id));
          const restoredRouteIds=[...new Set(parsed.routeIds!.filter((item):item is string=>typeof item==='string').map(migrateId))].filter(id=>availableIds.has(id));
          const restoredDone=[...new Set(parsed.completedQuestIds!.filter((item):item is string=>typeof item==='string').map(migrateId))].filter(id=>restoredRouteIds.includes(id));
          const restoredPandas=(parsed.foundRedPandas||[]).filter((item):item is string=>typeof item==='string'&&visibleRedPandas.some(record=>record.name===item));
          if(!restoredRouteIds.length){try{window.localStorage.removeItem(progressStorageKey);}catch{};setProgressLoaded(true);return;}
          setTransport(parsed.transport!);setCompanion(parsed.companion!);setDuration(parsed.duration!);setChosen(parsed.interests!.filter((item):item is string=>typeof item==='string'));
          setSavedRouteIds(restoredRouteIds);setDone(restoredDone);setFoundRedPandas(restoredPandas);
          setCurrent(Math.min(restoredRouteIds.length-1,Math.max(0,Math.floor(parsed.currentQuest!))));setPoints(Math.max(0,parsed.points!));setRouteReady(true);setHasSavedAdventure(true);
        }
      }
    }catch{
      setHasSavedAdventure(false);
    }finally{
      setProgressLoaded(true);
    }
  },[realSpots,visibleRedPandas]);

  useEffect(()=>{
    if(!progressLoaded||!adventureInProgress)return;
    const progress:AdventureProgress={version:1,status:'active',currentQuest:current,completedQuestIds:done,points,transport,companion,duration,interests:chosen,routeIds:route.map(spot=>spot.id),foundRedPandas,titleCandidate:currentTitle,updatedAt:new Date().toISOString()};
    try{window.localStorage.setItem(progressStorageKey,JSON.stringify(progress));setHasSavedAdventure(true);}catch{/* 保存不可でも冒険は継続 */}
  },[progressLoaded,adventureInProgress,current,done,points,transport,companion,duration,chosen,route,foundRedPandas,currentTitle]);

  useEffect(()=>{
    if(!titleHistoryLoaded||screen!=='complete'||!completeReady)return;
    setEarnedTitles(currentHistory=>{
      if(currentHistory.some(item=>item.title===currentTitle))return currentHistory;
      const next=[...currentHistory,{title:currentTitle,firstEarnedAt:new Date().toISOString()}];
      try{window.localStorage.setItem(titleStorageKey,JSON.stringify(next));}catch{/* 保存不可でもCOMPLETE画面は継続 */}
      return next;
    });
    try{window.localStorage.removeItem(progressStorageKey);}catch{/* 称号保存とCOMPLETE表示は継続 */}
    setHasSavedAdventure(false);
  },[titleHistoryLoaded,screen,completeReady,currentTitle]);
  const resetAdventureProgress=()=>{setFeatureNotice(null);setTransport('');setCompanion('');setDuration('');setChosen([]);setCurrent(0);setDone([]);setPoints(0);setFoundPanda('');setFoundRedPandas([]);setMessage('');setDemo(false);setRouteReady(false);setSavedRouteIds([]);setHasSavedAdventure(false);try{window.localStorage.removeItem(progressStorageKey);}catch{/* 保存不可でも画面上はリセット */}nav('transport');};
  const requestNewAdventure=()=>{if(!hasSavedAdventure){resetAdventureProgress();return;}setFeatureNotice({title:'新しい冒険を始めますか？',text:'現在進行中のクエスト、ポイント、選択内容はリセットされます。獲得済みの称号履歴は残ります。',actionLabel:'リセットして始める',action:resetAdventureProgress});};
  const guideToRoute=()=>{setFeatureNotice(null);nav(transport?'settings':'transport');};
  const openFeature=(feature:string)=>{
    if(feature==='おすすめルート'){nav('transport');return;}
    if(feature==='公園クエスト'){
      if(completeReady){nav('complete');return;}
      if(routeReady&&route.length){nav('quest');return;}
      setFeatureNotice({title:'公園クエスト',text:'先におすすめルートを作ってください。条件を選ぶと、実データからクエストルートを作成します。',actionLabel:'ルート設定へ',action:guideToRoute});return;
    }
    if(feature==='称号を獲得'){
      setFeatureNotice({title:'称号を獲得',kind:'titles',text:'クエスト達成内容に応じて称号を獲得できます。獲得した称号と初回獲得日は、このブラウザに保存されます。'});return;
    }
    if(completeReady){nav('complete');return;}
    setFeatureNotice({title:'冒険カード',text:'クエスト完了後、訪問スポット・ポイント・称号を冒険カードとして画像保存できます。'});
  };

  return <main className="app-shell"><section className="phone-frame">
    <header className="topbar"><button className="brand-mini" onClick={()=>nav('top')} aria-label="トップへ戻る">NQ</button><span>NISHIYAMA QUEST</span><button className="utility" onClick={openToilet}>近くのトイレ</button></header>
    {!toiletOpen&&screen!=='top'&&<nav className="screen-nav" aria-label="画面移動"><button onClick={()=>nav('top')}>⌂ TOPへ</button>{adventureInProgress&&screen!=='quest'&&<button onClick={()=>nav('quest')}>⚑ クエストへ</button>}{adventureInProgress&&screen!=='map'&&<button onClick={()=>nav('map')}>◎ マップへ</button>}</nav>}

    {screen==='top'&&<div className="hero screen">
      <div className="hero-visual"><img className="hero-bg" src="/assets/park-background.png" alt="緑豊かな公園のイメージ"/><div className="hero-overlay"/><div className="hero-title"><div className="eyebrow">SABAE · FUKUI</div><p className="quest-label">PARK ADVENTURE <small>公園アドベンチャー</small></p><h1>NISHIYAMA<br/><em>QUEST</em></h1><p className="catchcopy">今日の西山公園を、<br/>あなただけの<span className="accent">冒険</span>に。</p><p className="pretrip-copy">行く前にプランを作って、現地で冒険しよう。</p></div><img className="hero-panda" src="/assets/explorer-red-panda.png" alt="探検家レッサーパンダ"/></div>
      <div className="hero-actions">{hasSavedAdventure&&<button className="continue-button" onClick={()=>nav('quest')}>⚑ 冒険のつづきから <small>QUEST（クエスト） {Math.min(current+1,route.length)} / {route.length} · {points} POINT</small></button>}<button className="primary" onClick={requestNewAdventure}>{hasSavedAdventure?'新しい冒険を始める':'冒険をはじめる'} <span>›</span></button><p className="microcopy">選択条件とオープンデータから、あなた向けのルートをつくります</p></div>
      <div className="feature-grid" aria-label="NISHIYAMA QUESTでできること">{[['↗','おすすめルート'],['⚑','公園クエスト'],['★','称号を獲得'],['▣','冒険カード']].map(([icon,label])=><button type="button" className="feature-card" key={label} onClick={()=>openFeature(label)}><i>{icon}</i><b>{label}</b></button>)}</div>
      <button className="text-link" onClick={()=>nav('data')}>使用オープンデータを見る</button>
    </div>}

    {screen==='transport'&&<div className="screen form-screen">
      <ScenicHeader eyebrow="FIRST CHOICE" title="交通手段を選ぼう" lead="どうやって西山公園へ来る？" label="選んでね"/><Stepper active={1}/><p className="lead">移動手段に合わせて、実データからスタート地点を調整します。</p>
      <div className="option-grid">{transports.map((value,index)=><button key={value} className={`option ${transport===value?'selected':''}`} onClick={()=>setTransport(value)} aria-pressed={transport===value}><span className="option-icon">{transportMarks[index]}</span><b>{value}</b><small>{value==='車'?'駐車場データを使用':value==='バス'?'バス停データを使用':'徒歩でスタート'}</small></button>)}</div>
      <button className="primary" disabled={!transport} onClick={()=>nav('settings')}>次へ進む <span>›</span></button>
      <button className="text-link" onClick={()=>nav('top')}>TOPへ戻る</button>
    </div>}

    {screen==='settings'&&<div className="screen compact">
      <ScenicHeader eyebrow="ADVENTURE SETTINGS" title="冒険を設定しよう" lead="あなたにぴったりのルートをつくります。"/><Stepper active={2}/>
      <div className="selection-section"><fieldset><legend>誰と来た？</legend><div className="chips">{companions.map(value=><button key={value} className={companion===value?'active':''} onClick={()=>setCompanion(value)} aria-pressed={companion===value}>{value}</button>)}</div></fieldset></div>
      <div className="selection-section"><fieldset><legend>滞在時間</legend><div className="chips">{durations.map(value=><button key={value} className={duration===value?'active':''} onClick={()=>setDuration(value)} aria-pressed={duration===value}>{value}</button>)}</div></fieldset></div>
      <div className="selection-section"><fieldset><legend>興味 <small>複数選択OK</small></legend><div className="chips">{interests.map(value=><button key={value} className={chosen.includes(value)?'active':''} onClick={()=>toggle(value)} aria-pressed={chosen.includes(value)}>{value}</button>)}</div></fieldset></div>
      <button className="primary" disabled={!companion||!duration||!chosen.length} onClick={()=>{const nextRoute=generateRoute({transport,companion,duration,interests:chosen},realSpots);setSavedRouteIds(nextRoute.map(spot=>spot.id));setRouteReady(true);setCurrent(0);setDone([]);setPoints(0);setFoundPanda('');setFoundRedPandas([]);nav('route');}}>おすすめルートを見る <span>›</span></button>
      <button className="text-link" onClick={()=>nav('transport')}>交通手段へ戻る</button>
    </div>}

    {screen==='route'&&<div className="screen">
      <ScenicHeader eyebrow="YOUR ADVENTURE" title="おすすめルート" lead="あなたにぴったりの冒険ができました。" label="この順番で"/><Stepper active={3}/>
      <section className="route-hero"><h2>{routeTitle(companion,chosen)}</h2><div className="route-summary"><span>クエスト体験時間 <b>約{route.reduce((sum,spot)=>sum+spot.minutes,0)}分</b></span><span>QUEST（クエスト） <b>{route.length}</b></span></div><p className="route-time-note">※スポット間の移動時間は含みません。</p></section>
      {accessPoint&&<div className="access-card"><small>{transport==='車'?'PARKING START':'BUS STOP START'}</small><strong>{accessPoint.name}</strong><span>鯖江市オープンデータ</span></div>}
      <div className="route-list"><i>START <small>スタート</small></i>{route.map((spot,index)=><div className="spot-card" key={spot.id}><span>{String(index+1).padStart(2,'0')}</span><div><small>{spot.type} QUEST（クエスト）</small><strong>{spot.name}</strong>{spot.description&&<p>{spot.description}</p>}<em>体験時間 約{spot.minutes}分</em></div></div>)}<i>GOAL <small>ゴール</small></i></div><p className="coordinate-note">※一部クエスト地点は、鯖江市オープンデータに登録された施設周辺の位置情報を参照しています。</p>
      <div className="button-row"><button className="secondary" onClick={()=>nav('map')}>マップ</button><button className="primary" disabled={!route.length} onClick={()=>{setCurrent(0);nav('quest');}}>冒険へ <span>›</span></button></div>
      <button className="text-link" onClick={()=>nav('settings')}>冒険設定へ戻る</button>
    </div>}

    {screen==='map'&&<div className="screen">
      <ScenicHeader eyebrow="ADVENTURE MAP" title="マップ" lead="実データの地点を順番に確認しよう。" label="順番に進もう"/><p className="source-badge">OpenStreetMap · 鯖江市オープンデータ座標</p>
      <QuestMap quests={mapPoints.quests} toilets={mapPoints.toilets} parking={mapPoints.parking} busStops={mapPoints.busStops} currentLocation={gps}/>
      <div className="map-key"><span><i className="key-current"/>現在地</span><span><i className="key-quest"/>クエスト</span><span><i className="key-toilet"/>トイレ</span><span><i className="key-parking"/>駐車場</span><span><i className="key-bus"/>バス停</span></div>
      <button className="secondary map-locate" onClick={locate}>現在地を取得して地図を移動</button>
      <ol className="map-legend"><li>START{accessPoint?` · ${accessPoint.name}`:''}</li>{route.map((spot,index)=><li key={spot.id}>QUEST {index+1} · {spot.name}</li>)}<li>GOAL</li></ol>
      <button className="primary" onClick={()=>nav('quest')}>クエストを見る <span>›</span></button>
    </div>}

    {screen==='quest'&&active&&<div className="screen quest-screen">
      <div className="quest-top"><div><p className="step-count">CURRENT QUEST <span>現在のクエスト</span></p><div className="quest-counter">⚑ QUEST <small>クエスト</small> <b>{String(current+1).padStart(2,'0')}</b> / {String(route.length).padStart(2,'0')}</div></div><Guide label="挑戦しよう"/></div>
      <h2>{active.type==='レッサーパンダ'?'今日会えたレッサーパンダを探そう！':active.type==='写真'?'今日の一枚を見つけよう！':`${active.type}クエストに挑戦！`}</h2>
      {active.type==='レッサーパンダ'?<div className="panda-quest-panel"><div className="panda-found-count"><span>見つけたレッサーパンダ</span><strong>{foundRedPandas.length} <small>/ {visibleRedPandas.length}</small></strong></div><p className="panda-exhibit-note">展示される個体は日によって変わります。今日会えた子を選んでね。</p><div className="panda-choice-grid">{visibleRedPandas.map(record=>{const panda=openData.redPandas.find(item=>item.name===record.name);const individual=openData.redPandaIndividuals.find(item=>item.name===record.name);const isFound=foundRedPandas.includes(record.name);return <button type="button" className={`panda-choice ${foundPanda===record.name?'selected':''} ${isFound?'found':''}`} key={record.name} onClick={()=>setFoundPanda(record.name)} aria-pressed={foundPanda===record.name}><img src={record.photo?.imagePath||redPandaPhotoPlaceholder} alt={record.photo?`レッサーパンダ ${record.name}`:`${record.name} 写真準備中`}/><strong>{record.name}</strong><small>{panda?.gender||individual?.gender||'性別データなし'}</small>{!record.photo&&<span className="photo-pending">写真準備中</span>}{isFound&&<em>✓ 見つけた！</em>}</button>})}</div>{selectedPandaRecord&&<div className="panda-profile-wrap"><div className="panda-profile"><img src={selectedPandaRecord.photo?.imagePath||redPandaPhotoPlaceholder} alt={selectedPandaRecord.photo?`選択したレッサーパンダ ${selectedPandaRecord.name}`:`${selectedPandaRecord.name} 写真準備中`}/><div><span>{foundRedPandas.includes(selectedPandaRecord.name)?'発見済み':'今日会えた子'}</span><h3>{selectedPandaRecord.name}</h3><p>{[selectedPanda?.gender||selectedPandaIndividual?.gender,selectedPandaBirthDate&&`生年月日 ${formatOpenDate(selectedPandaBirthDate)}`,selectedPanda?.birthplace&&`出身 ${selectedPanda.birthplace}`,selectedPanda?.profile||selectedPandaIndividual?.remarks].filter(Boolean).join(' · ')||'プロフィールデータは準備中です。'}</p>{selectedPandaRecord.photo?<a href={selectedPandaRecord.photo.datasetUrl} target="_blank" rel="noreferrer">画像オープンデータ</a>:<small>公式写真は準備中です</small>}</div></div><button className="primary panda-found-button" disabled={!reached||foundRedPandas.includes(selectedPandaRecord.name)} onClick={markPandaFound}>{foundRedPandas.includes(selectedPandaRecord.name)?'✓ 見つけた！':'この子を見つけた！'}</button></div>}{foundRedPandas.length>0&&<div className="panda-next-choice"><p><b>レッサーパンダ観察QUEST（クエスト）</b>を達成できます。どうする？</p><button className="primary" onClick={finishQuest}>次のクエストへ進む <span>›</span></button><button className="secondary" onClick={()=>setFoundPanda('')}>もう少しレッサーパンダを探す</button><small>ポイントはクエスト終了時に100 POINTを1回付与します。</small></div>}</div>:<><div className="quest-art">{activeQuestImage&&<img className="quest-scene-image" src={activeQuestImage} alt={`${active.type}クエストの案内イラスト`}/>}</div><div className="quest-meta"><p className="source-badge">{active.type} QUEST（クエスト） · 提供：福井県鯖江市</p><strong className="quest-spot">SPOT（地点）：{active.name}</strong><p className="lead">{questInstruction(active.type)}</p><div className="quest-reward"><span>目標：現地で体験する</span><b>100 POINT</b></div></div></>}
      <button className="secondary" onClick={()=>nav('location')}>現在地を確認</button>{active.type!=='レッサーパンダ'&&<button className="primary" disabled={!reached} onClick={finishQuest}>見つけた！</button>}
      <div className="quest-dots">{route.map((spot,index)=><span key={spot.id} className={done.includes(spot.id)?'done':index===current?'active':''}>{String(index+1).padStart(2,'0')}</span>)}</div>{message&&<div className="point-get">{message}</div>}
    </div>}

    {screen==='location'&&<div className="screen">
      <ScenicHeader eyebrow="YOUR LOCATION" title="現在地を確認" lead="クエスト地点から60m以内で到着です。" label="迷わず進もう"/>
      <div className="location-card"><div className="radar"><i/></div><strong>{demo?'QUEST POINTに到着！':reached?'QUEST POINTに到着！':gps?'現在地を取得済み':'現在地を取得してください'}</strong><p>{demo?'GPS到着判定のみスキップしています。':activeDistance!==null?`クエスト地点まで直線距離 約 ${activeDistance}m`:'現在地を取得すると距離を計算します。'}</p></div>
      <button className="secondary" onClick={locate}>現在地を取得</button>
      <div className="gps-privacy-note"><strong>位置情報の扱い</strong><p>現在地は端末内で目的地との距離確認に使用し、GPS座標そのものを保存・サーバー送信しません。地図表示時はOpenStreetMapの地図画像を読み込みます。</p>{gpsAccuracy!==null&&<b>現在の位置精度：約±{gpsAccuracy}m</b>}<small>GPSには周辺環境や端末により誤差が生じる場合があります。</small></div>
      {gps&&locationQuestPoints.length>0&&<section className="location-map-panel" aria-label="現在地とクエスト地点"><div className="location-map-heading"><div><small>POSITION MAP</small><strong>{active?.name}</strong></div><span>{activeDistance!==null?`約${activeDistance}m`:'--'}</span></div><QuestMap quests={locationQuestPoints} toilets={emptyMapPoints} parking={emptyMapPoints} busStops={emptyMapPoints} currentLocation={gps} focusCurrentAndPoints compact/><div className="map-key location-map-key"><span><i className="key-current"/>現在地</span><span><i className="key-quest"/>クエスト地点</span></div></section>}
      <label className="demo-toggle"><span><b>デモモード</b><small>審査会用：GPS到着判定のみスキップ</small></span><input type="checkbox" checked={demo} onChange={event=>setDemo(event.target.checked)}/></label>
      <div className="location-actions"><button className="primary location-map-button" onClick={()=>nav('map')}><span aria-hidden="true">◈</span>地図で現在地を確認する</button><button className="secondary" onClick={()=>nav('quest')}>クエストへ戻る <span>›</span></button></div>{message&&<p className="status">{message}</p>}
    </div>}

    {screen==='complete'&&<div className="screen complete">
      <div className="complete-visual"><img className="complete-bg" src="/assets/park-background.png" alt=""/><img className="complete-panda" src="/assets/explorer-red-panda.png" alt="冒険完了を祝う探検家レッサーパンダ"/><div><p className="step-count">ALL QUESTS CLEARED <span>全クエスト達成</span></p><h2>冒険<br/>COMPLETE!<small>冒険クリア！</small></h2><p>西山公園の冒険をやりきりました。</p></div></div>
      <div className="stats"><span>訪れた場所<b>{done.length}</b></span><span>使用地点<b>実データ</b></span><span>獲得ポイント<b>{points}</b></span><span>達成クエスト<b>{done.length}</b></span></div>
      {foundRedPandas.length>0&&<section className="complete-panda-record"><span>今日会えたレッサーパンダ</span><strong>{foundRedPandas.length}頭</strong><p>{foundRedPandas.join('・')}</p></section>}
      <div className={`adventure-card card-${cardDecoration.toLowerCase()}`} ref={cardRef}><small>NISHIYAMA QUEST</small><i className="card-decoration">{cardDecoration}</i><h3>QUEST<br/>COMPLETE!</h3><p className="card-route">{currentRouteName}</p><p>訪問スポット {done.length}<br/>獲得ポイント {points}{foundRedPandas.length>0&&<><br/>レッサーパンダ発見 {foundRedPandas.length}頭</>}</p><strong>称号「{currentTitle}」</strong><time>{new Date().toLocaleDateString('ja-JP')}</time></div>
      <button className="primary" onClick={saveCard}>冒険カードを画像保存</button>{cardSaveMessage&&<p className="card-save-status" role="status">{cardSaveMessage}</p>}<button className="text-link" onClick={()=>{setDone([]);setPoints(0);setCurrent(0);setRouteReady(false);setSavedRouteIds([]);setFoundPanda('');setFoundRedPandas([]);setCardSaveMessage('');nav('top');}}>別のルートに挑戦する</button>
    </div>}

    {screen==='data'&&<div className="screen data-page">
      <ScenicHeader eyebrow="OPEN DATA" title="使用オープンデータ" lead="実際の鯖江市オープンデータを使用しています。"/>
      {[
        ['公共トイレ（福井県鯖江市）',openData.counts.publicToilets,'近くのトイレ表示・一部クエスト地点の周辺位置参照'],['駐車場（福井県鯖江市）',openData.counts.parking,'車利用時のスタート地点・地図表示'],['バス停（福井県鯖江市）',openData.counts.busStops,'バス利用時のスタート地点・地図表示'],['西山動物園のレッサーパンダ一覧',openData.counts.redPandas,'現在の個体候補・レッサーパンダクエスト'],['レッサーパンダ飼育個体情報',openData.counts.redPandaIndividuals,'現在候補の個体プロフィール補助'],['令和7年度 西山公園入場者 市区町村別割合',openData.counts.visitorFlow,'県外来園者の傾向を把握するための企画分析・参考データ'],
        ...redPandaPhotoRecords.map(photo=>[`レッサーパンダ画像(${photo.name})`,1,'個体選択カード・プロフィール詳細',photo.datasetUrl])
      ].map(([name,count,usage,url])=><div className="dataset" key={name as string}><strong>{name as string}</strong><span>{count as number}件読込 · {usage as string}</span><small>提供：福井県鯖江市 · クリエイティブ・コモンズ 表示 2.1</small>{url&&<a href={url as string} target="_blank" rel="noreferrer">データセットページ</a>}</div>)}
      <button className="secondary" onClick={()=>nav('top')}>トップへ戻る</button>
    </div>}

    {toiletOpen&&<section className="toilet-page" aria-label="近くのトイレ"><div className="toilet-page-header"><button className="back-button" onClick={closeToilet}>← 戻る</button><strong>近くのトイレ</strong></div><div className="toilet-page-scroll"><ScenicHeader eyebrow="NEARBY TOILETS" title="近くのトイレ" lead={gps?'現在地から近い順に表示します。':'現在地未取得のため、西山公園周辺から表示します。'} label="快適に冒険"/><button className="secondary toilet-locate" onClick={locate}>現在地を取得</button>{selectedToiletPoints.length>0&&<section className="toilet-map-panel" id="selected-toilet-map" aria-label="選択したトイレの地図"><div className="location-map-heading"><div><small>SELECTED TOILET</small><strong>{selectedToilet?.name}</strong></div><span>{selectedToiletDistance!==null?`約${selectedToiletDistance}m`:'距離未取得'}</span></div><QuestMap quests={emptyMapPoints} toilets={selectedToiletPoints} parking={emptyMapPoints} busStops={emptyMapPoints} currentLocation={gps} focusCurrentAndPoints highlightedPointId={selectedToiletId} compact/><div className="map-key location-map-key"><span><i className="key-current"/>現在地</span><span><i className="key-toilet"/>選択したトイレ</span></div>{!gps&&<p className="toilet-map-note">現在地を取得すると、トイレとの位置関係を表示します。</p>}</section>}{nearbyToilets.slice(0,8).map((toilet,index)=>{const hasCoordinates=toilet.latitude!==null&&toilet.longitude!==null;return <button type="button" className={`toilet-row toilet-selectable ${selectedToiletId===toilet.id?'selected':''}`} key={toilet.id} onClick={()=>hasCoordinates&&selectToilet(toilet.id)} disabled={!hasCoordinates} aria-pressed={selectedToiletId===toilet.id}><b><i>{index+1}</i><span>{toilet.name}</span></b><span className="toilet-row-meta"><strong>{gps&&hasCoordinates?`${Math.round(distance(gps,{lat:toilet.latitude!,lng:toilet.longitude!}))}m`:'現在地未取得'}</strong><small>{hasCoordinates?'◈ このトイレを地図で見る':'座標データなし'}</small></span></button>})}<p className="source-note">公共トイレ{openData.counts.publicToilets}件を読込済み · 提供：福井県鯖江市</p></div></section>}
    {featureNotice&&<div className="modal feature-notice" role="dialog" aria-modal="true" aria-labelledby="feature-notice-title" onClick={()=>setFeatureNotice(null)}><div className="feature-notice-card" onClick={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setFeatureNotice(null)} aria-label="閉じる">×</button><span className="notice-flag">NISHIYAMA QUEST</span><h2 id="feature-notice-title">{featureNotice.title}</h2><p>{featureNotice.text}</p>{featureNotice.kind==='titles'&&<div className="title-history">{!earnedTitles.length&&<p className="no-titles">まだ称号を獲得していません</p>}{allTitles.map(name=>{const earned=earnedTitles.find(item=>item.title===name);return <div className={`title-history-row ${earned?'earned':'locked'}`} key={name}><span>{earned?'★':'◇'}</span><div><b>{name}</b><small>{earned?`初回獲得日：${new Date(earned.firstEarnedAt).toLocaleDateString('ja-JP')}`:'未獲得'}</small></div></div>})}</div>}{featureNotice.action&&<button className="primary" onClick={featureNotice.action}>{featureNotice.actionLabel} <span>›</span></button>}<button className="text-link" onClick={()=>setFeatureNotice(null)}>閉じる</button></div></div>}
  </section></main>;
}
