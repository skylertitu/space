'use client';

import { useState, useEffect, useRef } from 'react';

interface PriceDataV3 {
  usdPrice: number;
  blockId: number;
  decimals: number;
  priceChange24h: number;
}

const GLOBAL_PRICE_CACHE: { [key: string]: number } = {};
const GLOBAL_CACHE_TIME: { [key: string]: number } = {};

export function usePriceFromJupiter(tokenAddresses: string[], cacheDurationMs = 60000) {
  const [prices, setPrices] = useState<{ [key: string]: number | null }>({});
  const [loading, setLoading] = useState(true);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (tokenAddresses.length === 0) {
      setPrices({});
      setLoading(false);
      setSecondsRemaining(0);
      return;
    }

    const fetchPrices = async () => {
      const now = Date.now();
      
      // Check global cache first
      let allCached = true;
      const cachedPrices: { [key: string]: number | null } = {};
      for (const address of tokenAddresses) {
        const cacheTime = GLOBAL_CACHE_TIME[address] || 0;
        if (now - cacheTime < cacheDurationMs && GLOBAL_PRICE_CACHE[address] !== undefined) {
          cachedPrices[address] = GLOBAL_PRICE_CACHE[address];
        } else {
          allCached = false;
        }
      }

      if (allCached) {
        setPrices(cachedPrices);
        setLoading(false);
        const oldestTime = Math.min(...tokenAddresses.map(addr => GLOBAL_CACHE_TIME[addr] || now));
        const elapsed = now - oldestTime;
        const remaining = Math.max(0, cacheDurationMs - elapsed);
        setSecondsRemaining(Math.ceil(remaining / 1000));
        return;
      }

      try {
        setLoading(true);
        const params = tokenAddresses.join(',');
        const response = await fetch(`https://api.jup.ag/price/v3?ids=${params}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // V3 response is directly { mint: { usdPrice, ... }, ... }
        const data: { [key: string]: PriceDataV3 } = await response.json();

        const newPrices: { [key: string]: number | null } = {};
        for (const address of tokenAddresses) {
          const val = data[address]?.usdPrice || null;
          newPrices[address] = val;
          if (val !== null) {
            GLOBAL_PRICE_CACHE[address] = val;
            GLOBAL_CACHE_TIME[address] = now;
          }
        }
        setPrices(newPrices);
        setSecondsRemaining(Math.ceil(cacheDurationMs / 1000));
      } catch (error) {
        console.error('Error fetching prices from Jupiter:', error);
        // Fallback to memory cache if request fails
        const fallbackPrices: { [key: string]: number | null } = {};
        for (const address of tokenAddresses) {
          fallbackPrices[address] = GLOBAL_PRICE_CACHE[address] !== undefined ? GLOBAL_PRICE_CACHE[address] : null;
        }
        setPrices(fallbackPrices);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();

    // Timer to update remaining seconds
    const timerInterval = setInterval(() => {
      const now = Date.now();
      const oldestTime = Math.min(...tokenAddresses.map(addr => GLOBAL_CACHE_TIME[addr] || now));
      const elapsed = now - oldestTime;
      const remaining = Math.max(0, cacheDurationMs - elapsed);
      setSecondsRemaining(Math.ceil(remaining / 1000));

      // Refetch when expired
      if (remaining <= 0) {
        fetchPrices();
      }
    }, 1000);

    return () => {
      clearInterval(timerInterval);
    };
  }, [tokenAddresses.join(','), cacheDurationMs]);

  return { prices, loading, secondsRemaining };
}
