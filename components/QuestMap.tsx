'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

export type MapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type QuestMapProps = {
  quests: MapPoint[];
  toilets: MapPoint[];
  parking: MapPoint[];
  busStops: MapPoint[];
  currentLocation: { lat: number; lng: number } | null;
};

const iconHtml = (kind: string, label: string) =>
  `<span class="map-symbol map-symbol-${kind}"><b>${label}</b></span>`;

export default function QuestMap({ quests, toilets, parking, busStops, currentLocation }: QuestMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const currentLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const [mapStatus,setMapStatus]=useState<'loading'|'ready'|'error'>('loading');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const allPoints = [...quests, ...toilets, ...parking, ...busStops];
    if (!allPoints.length) return;

    let cancelled = false;
    let map: LeafletMap | null = null;

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;

      const center: [number, number] = [
        allPoints.reduce((sum, point) => sum + point.latitude, 0) / allPoints.length,
        allPoints.reduce((sum, point) => sum + point.longitude, 0) / allPoints.length,
      ];

      map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(center, 15);
      mapRef.current = map;

      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      });
      tiles.on('load',()=>setMapStatus('ready'));
      tiles.on('tileerror',()=>setMapStatus('error'));
      tiles.addTo(map);

      const makeIcon = (kind: string, label: string) => L.divIcon({
        className: 'quest-map-icon',
        html: iconHtml(kind, label),
        iconSize: [34, 42],
        iconAnchor: [17, 38],
        popupAnchor: [0, -38],
      });

      const addPoints = (points: MapPoint[], kind: string, label: string, layer: import('leaflet').LayerGroup) => {
        points.forEach((point, index) => {
          const markerLabel = kind === 'quest' ? String(index + 1) : label;
          const marker = L.marker([point.latitude, point.longitude], { icon: makeIcon(kind, markerLabel) });
          const popup = document.createElement('div');
          const heading = document.createElement('strong');
          const coordinates = document.createElement('small');
          heading.textContent = point.name;
          coordinates.textContent = `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`;
          popup.appendChild(heading);
          popup.appendChild(document.createElement('br'));
          popup.appendChild(coordinates);
          marker.bindPopup(popup);
          marker.addTo(layer);
        });
      };

      const questLayer = L.layerGroup().addTo(map);
      const toiletLayer = L.layerGroup().addTo(map);
      const parkingLayer = L.layerGroup().addTo(map);
      const busLayer = L.layerGroup().addTo(map);
      const currentLayer = L.layerGroup().addTo(map);
      currentLayerRef.current = currentLayer;

      addPoints(quests, 'quest', '', questLayer);
      addPoints(toilets, 'toilet', 'WC', toiletLayer);
      addPoints(parking, 'parking', 'P', parkingLayer);
      addPoints(busStops, 'bus', 'B', busLayer);

      L.control.layers(undefined, {
        'クエスト地点': questLayer,
        '公共トイレ': toiletLayer,
        '駐車場': parkingLayer,
        'バス停': busLayer,
        '現在地': currentLayer,
      }, { collapsed: true }).addTo(map);

      const questBounds = quests.map((point) => [point.latitude, point.longitude] as [number, number]);
      const initialBounds = questBounds.length ? questBounds : allPoints.map((point) => [point.latitude, point.longitude] as [number, number]);
      map.fitBounds(initialBounds, { padding: [38, 38], maxZoom: 17 });
      if (currentLocation) {
        L.marker([currentLocation.lat, currentLocation.lng], {
          icon: makeIcon('current', '●'),
        }).bindPopup('現在地').addTo(currentLayer);
        map.flyTo([currentLocation.lat, currentLocation.lng], 17, { duration: 0.8 });
      }
      window.setTimeout(() => map?.invalidateSize(), 0);
    }).catch(()=>setMapStatus('error'));

    return () => {
      cancelled = true;
      currentLayerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, [quests, toilets, parking, busStops]);

  useEffect(() => {
    if (!currentLocation || !mapRef.current || !currentLayerRef.current) return;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || !currentLayerRef.current) return;
      currentLayerRef.current.clearLayers();
      L.marker([currentLocation.lat, currentLocation.lng], {
        icon: L.divIcon({
          className: 'quest-map-icon',
          html: iconHtml('current', '●'),
          iconSize: [36, 44],
          iconAnchor: [18, 40],
          popupAnchor: [0, -40],
        }),
      }).bindPopup('現在地').addTo(currentLayerRef.current);
      mapRef.current.flyTo([currentLocation.lat, currentLocation.lng], 17, { duration: 0.8 });
    });
    return () => { cancelled = true; };
  }, [currentLocation]);

  return <div className="leaflet-map-wrap"><div ref={containerRef} className="leaflet-map" aria-label="西山公園周辺のOpenStreetMap"/>{mapStatus!=='ready'&&<p className={`map-status ${mapStatus}`}>{mapStatus==='error'?'地図を読み込めませんでした。通信状況を確認してください。':'地図を読み込んでいます…'}</p>}</div>;
}
