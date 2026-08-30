import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { buildCountryIndex, resolveCountry, type CountryIndexEntry } from '../lib/countryIndex';
import { getCapabilityStatus, type CapabilityStatus } from '../services/tauri/capabilities';