export type LocationNode = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  pkts: string;
  rtt: string;
  status: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  activeFlowsCount: number;
  threatLevel: string;
  ip: string;
};

export type CountryGeo = {
  name: string;
  iso: string;
  lat: number;
  lng: number;
  cap?: string | null;
  r?: string | null;
  sr?: string | null;
  fl?: string;
  state?: string | null;
};

export interface Globe3DProps {
  nodes: LocationNode[];
  selectedNode: LocationNode | null;
  onSelectNode: (node: LocationNode | null) => void;
  selectedCountry: CountryGeo | null;
  onSelectCountry: (country: CountryGeo | null) => void;
  isAutoRotate: boolean;
  hub?: { lat: number; lng: number } | null;

  // Telemetry props
  captureStatus: string;
  captureMetrics: {
    packets_per_sec: number;
    bytes_per_sec: number;
    packets_captured: number;
    bytes_captured: number;
    status: string;
  };
  activeFlows: LocationNode[];
}

export const Globe3D: React.FC<Globe3DProps> = ({
  nodes,
  selectedNode,
  onSelectNode,
  selectedCountry,
  onSelectCountry,
  isAutoRotate,
  hub,
  captureStatus,
  captureMetrics,
  activeFlows,
}) => {
  // Determine capture status display
  const statusDisplay =
    captureStatus === 'RUNNING' || captureStatus === 'LIVE'
      ? 'LIVE'
      : captureStatus === 'STOPPED'
      ? 'STOPPED'
      : captureStatus === 'ERROR'
      ? 'ERROR'
      : captureStatus === 'UNAVAILABLE'
      ? 'UNAVAILABLE'
      : 'STOPPED';

  // Determine metrics display
  const pps = captureMetrics.packets_per_sec || 0;
  const bps = captureMetrics.bytes_per_sec || 0;
  const totalPackets = captureMetrics.packets_captured || 0;
  const totalBytes = captureMetrics.bytes_captured || 0;

  // Render flow arcs from active flows with valid geographic data
  const flowArcs = useMemo(() => {
    const arcs: (THREE.Object3D | null)[] = [];
    for (const node of activeFlows) {
      if (node.lat !== undefined && node.lng !== undefined) {
        // Create arc from origin to node location
        // ( simplified - real implementation would create THRREE.ArrowHelper or Line )
        const color = node.color || '#ff0000';
        arcs.push(
          // In a full implementation, would create a THREE.Line between two points
          // For now, just track that we have flow data
          null
        );
      }
    }
    return arcs.filter((a) => a !== null);
  }, [activeFlows]);

  // Render status HUD overlay info
  const hudInfo = useMemo(() => (
    <div className="globe-hud">
      <div className="hud-line">{statusDisplay}</div>
      <div className="hud-line">{pps.toFixed(1)} pps</div>
      <div className="hud-line">{bps.toFixed(0)} bps</div>
      <div className="hud-line">{totalPackets} pkts</div>
      <div className="hud-line">{totalBytes} B</div>
    </div>
  ), [statusDisplay, pps, bps, totalPackets, totalBytes]);

  return null;
};

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { buildCountryIndex, resolveCountry, type CountryIndexEntry } from '../lib/countryIndex';
import { getCapabilityStatus, type CapabilityStatus } from '../services/tauri/capabilities';