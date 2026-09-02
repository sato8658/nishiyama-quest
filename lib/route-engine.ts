export type Preferences = { companion:string; duration:string; interests:string[]; transport:string };
export type Spot = { id:string; name:string; description?:string; type:string; minutes:number; interests:string[]; lat?:number; lng?:number; test?:boolean };

const companionInterests:Record<string,string[]> = {
  '家族':['レッサーパンダ','ゲーム','散策'],
  'シニア':['のんびり','自然','季節','景色'],
  'ひとり':['写真','自然','散策'],
  'カップル':['写真','自然','景色','のんびり'],
  '友達':['ゲーム','写真','散策'],
};

const pointDistance=(a:Spot,b:Spot)=>{
  if(typeof a.lat!=='number'||typeof a.lng!=='number'||typeof b.lat!=='number'||typeof b.lng!=='number')return 0;
  const r=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;
  return 2*r*Math.asin(Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2));
};

export function generateRoute(preferences: Preferences, spots: Spot[]) {
  const budget = preferences.duration === '30分' ? 30 : preferences.duration === '60分' ? 60 : preferences.duration === '90分' ? 90 : 120;
  const standardLimit = preferences.duration === '30分' ? 2 : preferences.duration === '60分' ? 3 : preferences.duration === '90分' ? 5 : 6;
  const limit = preferences.companion === 'シニア' ? Math.max(1, standardLimit - 1) : standardLimit;
  const companionTags=companionInterests[preferences.companion]??[];
  const eligibleSpots = spots.filter((spot) => spot.type !== 'レッサーパンダ' || preferences.interests.includes('レッサーパンダ'));
  const ranked=eligibleSpots.map((spot) => ({ spot, score: spot.interests.reduce((sum, tag) => sum + (preferences.interests.includes(tag) ? 4 : 0) + (companionTags.includes(tag) ? 1.5 : 0), 0) + (spot.minutes <= 25 ? 1 : 0) }))
    .sort((a,b) => b.score - a.score);
  const selected:Spot[]=[];
  let totalMinutes=0;
  const remaining=[...ranked];
  while(remaining.length){
    if(selected.length>=limit)break;
    if(preferences.companion==='シニア'&&selected.length){
      const previous=selected[selected.length-1];
      remaining.sort((a,b)=>(b.score-pointDistance(previous,b.spot)/250)-(a.score-pointDistance(previous,a.spot)/250));
    }
    const item=remaining.shift()!;
    if(totalMinutes+item.spot.minutes<=budget||selected.length===0){selected.push(item.spot);totalMinutes+=item.spot.minutes;}
  }
  return selected;
}

export function routeTitle(companion:string, interests:string[]) {
  if (interests.includes('レッサーパンダ')) return 'レッサーパンダに会いにいく冒険！';
  if (interests.includes('写真')) return '西山フォトクエスト！';
  if (companion === '家族') return '親子で西山大冒険！';
  return '気ままに西山クエスト！';
}
