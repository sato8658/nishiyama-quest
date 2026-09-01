export type Preferences = { companion:string; duration:string; interests:string[]; transport:string };
export type Spot = { id:string; name:string; description?:string; type:string; minutes:number; interests:string[]; lat?:number; lng?:number; test?:boolean };

export function generateRoute(preferences: Preferences, spots: Spot[]) {
  const budget = preferences.duration === '30分' ? 30 : preferences.duration === '60分' ? 60 : preferences.duration === '90分' ? 90 : 120;
  const limit = preferences.duration === '30分' ? 2 : preferences.duration === '60分' ? 3 : preferences.duration === '90分' ? 5 : 6;
  const eligibleSpots = spots.filter((spot) => spot.type !== 'レッサーパンダ' || preferences.interests.includes('レッサーパンダ'));
  const ranked=eligibleSpots.map((spot) => ({ spot, score: spot.interests.reduce((sum, tag) => sum + (preferences.interests.includes(tag) ? 3 : 0), 0) + (spot.minutes <= 25 ? 1 : 0) }))
    .sort((a,b) => b.score - a.score);
  const selected:Spot[]=[];
  let totalMinutes=0;
  for(const item of ranked){
    if(selected.length>=limit)break;
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
