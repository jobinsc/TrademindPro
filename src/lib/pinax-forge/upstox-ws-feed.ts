/**
 * PinaxForge-only Upstox Market Data Feed V3 WebSocket client.
 * Paper trading LTP stream — does not place orders. Not used by Blink.
 */

import protobuf from 'protobufjs';
import { UPSTOX_V3_BASE } from '@/lib/upstox-historical';

const AUTH_URL = `${UPSTOX_V3_BASE}/feed/market-data-feed/authorize`;
const FRESH_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

/** Minimal MarketDataFeed V3 proto (LTPC path only). */
const PROTO = `
syntax = "proto3";
package com.upstox.marketdatafeederv3udapi.rpc.proto;

message LTPC {
  double ltp = 1;
  int64 ltt = 2;
  int64 ltq = 3;
  double cp = 4;
}

message MarketOHLC {
  repeated OHLC ohlc = 1;
}

message OHLC {
  string interval = 1;
  double open = 2;
  double high = 3;
  double low = 4;
  double close = 5;
  int64 vol = 6;
  int64 ts = 7;
}

message Quote {
  int64 bidQ = 1;
  double bidP = 2;
  int64 askQ = 3;
  double askP = 4;
}

message OptionGreeks {
  double delta = 1;
  double theta = 2;
  double gamma = 3;
  double vega = 4;
  double rho = 5;
}

message MarketLevel {
  repeated Quote bidAskQuote = 1;
}

message MarketFullFeed {
  LTPC ltpc = 1;
  MarketLevel marketLevel = 2;
  OptionGreeks optionGreeks = 3;
  MarketOHLC marketOHLC = 4;
  double atp = 5;
  int64 vtt = 6;
  double oi = 7;
  double iv = 8;
  double tbq = 9;
  double tsq = 10;
}

message IndexFullFeed {
  LTPC ltpc = 1;
  MarketOHLC marketOHLC = 2;
}

message FullFeed {
  oneof FullFeedUnion {
    MarketFullFeed marketFF = 1;
    IndexFullFeed indexFF = 2;
  }
}

message FirstLevelWithGreeks {
  LTPC ltpc = 1;
  Quote firstDepth = 2;
  OptionGreeks optionGreeks = 3;
  int64 vtt = 4;
  double oi = 5;
  double iv = 6;
}

message Feed {
  oneof FeedUnion {
    LTPC ltpc = 1;
    FullFeed fullFeed = 2;
    FirstLevelWithGreeks firstLevelWithGreeks = 3;
  }
  int32 requestMode = 4;
}

message MarketInfo {
  map<string, int32> segmentStatus = 1;
}

message FeedResponse {
  int32 type = 1;
  map<string, Feed> feeds = 2;
  int64 currentTs = 3;
  MarketInfo marketInfo = 4;
}
`;

export type CachedLtp = { ltp: number; ts: number };
export type LtpHandler = (instrumentKey: string, ltp: number, ts: number) => void;

type FeedDecoded = {
  feeds?: Record<
    string,
    {
      ltpc?: { ltp?: number };
      fullFeed?: {
        marketFF?: { ltpc?: { ltp?: number } };
        indexFF?: { ltpc?: { ltp?: number } };
      };
      firstLevelWithGreeks?: { ltpc?: { ltp?: number } };
    }
  >;
};

let FeedResponseType: protobuf.Type | null = null;

function getFeedResponseType(): protobuf.Type {
  if (FeedResponseType) return FeedResponseType;
  const parsed = protobuf.parse(PROTO);
  FeedResponseType = parsed.root.lookupType(
    'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse'
  );
  return FeedResponseType;
}

function extractLtp(feed: NonNullable<FeedDecoded['feeds']>[string]): number | null {
  const candidates = [
    feed.ltpc?.ltp,
    feed.fullFeed?.marketFF?.ltpc?.ltp,
    feed.fullFeed?.indexFF?.ltpc?.ltp,
    feed.firstLevelWithGreeks?.ltpc?.ltp,
  ];
  for (const n of candidates) {
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function keyVariants(key: string): string[] {
  const raw = String(key || '').trim();
  if (!raw) return [];
  return [...new Set([raw, raw.replace(/\|/g, ':'), raw.replace(/:/g, '|')])];
}

class PinaxUpstoxWsFeed {
  private ws: any = null;
  private accessToken: string | null = null;
  private connecting: Promise<void> | null = null;
  private intentionalClose = false;
  private backoffMs = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly wanted = new Set<string>();
  private readonly ltpCache = new Map<string, CachedLtp>();
  private readonly handlers = new Set<LtpHandler>();
  private lastTickAt: string | null = null;
  private lastError: string | null = null;

  isConnected(): boolean {
    // ws OPEN constant is 1; avoid importing WebSocket for type/runtime stability.
    return this.ws?.readyState === 1;
  }

  getLastTickAt(): string | null {
    return this.lastTickAt;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getStatus() {
    return {
      wsConnected: this.isConnected(),
      lastTickAt: this.lastTickAt,
      subscribedCount: this.wanted.size,
      lastError: this.lastError,
    };
  }

  onLtp(handler: LtpHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getCachedLtp(instrumentKey: string, maxAgeMs = FRESH_MS): number | null {
    for (const key of keyVariants(instrumentKey)) {
      const hit = this.ltpCache.get(key);
      if (hit && Date.now() - hit.ts <= maxAgeMs) return hit.ltp;
    }
    return null;
  }

  /** Any cached LTP regardless of age (HTTP fallback still preferred when stale). */
  peekCachedLtp(instrumentKey: string): number | null {
    for (const key of keyVariants(instrumentKey)) {
      const hit = this.ltpCache.get(key);
      if (hit && hit.ltp > 0) return hit.ltp;
    }
    return null;
  }

  async ensureConnected(accessToken: string): Promise<void> {
    this.accessToken = accessToken.trim();
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectOnce().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async subscribeInstruments(keys: string[]): Promise<void> {
    const next = keys.map((k) => k.trim()).filter(Boolean);
    for (const k of next) this.wanted.add(k);
    if (!this.accessToken) return;
    await this.ensureConnected(this.accessToken);
    this.sendSubUnsub('sub', next);
  }

  async unsubscribeInstruments(keys: string[]): Promise<void> {
    const next = keys.map((k) => k.trim()).filter(Boolean);
    for (const k of next) this.wanted.delete(k);
    this.sendSubUnsub('unsub', next);
  }

  /** Reconcile wanted set to exactly these keys (plus keep extras caller still wants). */
  async setSubscriptions(keys: string[]): Promise<void> {
    const desired = new Set(keys.map((k) => k.trim()).filter(Boolean));
    const toUnsub = [...this.wanted].filter((k) => !desired.has(k));
    const toSub = [...desired].filter((k) => !this.wanted.has(k));
    if (toUnsub.length) await this.unsubscribeInstruments(toUnsub);
    if (toSub.length) await this.subscribeInstruments(toSub);
    // Ensure connected even if sets already match
    if (desired.size && this.accessToken) {
      await this.ensureConnected(this.accessToken);
      if (this.isConnected() && desired.size) {
        this.sendSubUnsub('sub', [...desired]);
      }
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.wanted.clear();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private async connectOnce(): Promise<void> {
    if (!this.accessToken) throw new Error('Upstox access token required for WS feed');
    this.intentionalClose = false;

    const res = await fetch(AUTH_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text();
      this.lastError = `authorize ${res.status}: ${text.slice(0, 160)}`;
      throw new Error(this.lastError);
    }
    const json = (await res.json()) as {
      data?: { authorized_redirect_uri?: string; authorizedRedirectUri?: string };
    };
    const uri =
      json.data?.authorized_redirect_uri || json.data?.authorizedRedirectUri || '';
    if (!uri.startsWith('wss://')) {
      this.lastError = 'authorize response missing wss URI';
      throw new Error(this.lastError);
    }

    await new Promise<void>(async (resolve, reject) => {
      // ws can load optional native addons (bufferutil/utf-8-validate).
      // On some Windows setups those addons are broken and crash with:
      //   TypeError: bufferUtil.mask is not a function
      // Disable those addons right before importing `ws`.
      process.env.WS_NO_BUFFER_UTIL = '1';
      process.env.WS_NO_UTF_8_VALIDATE = '1';

      const wsMod = await import('ws');
      const WebSocketCtor = wsMod.default as any;

      // Keep perMessageDeflate off as an extra guard.
      const socket = new WebSocketCtor(uri, { followRedirects: true, perMessageDeflate: false });
      this.ws = socket;

      const onOpen = () => {
        this.backoffMs = 1_000;
        this.lastError = null;
        if (this.wanted.size) this.sendSubUnsub('sub', [...this.wanted]);
        resolve();
      };
      const onError = (err: Error) => {
        this.lastError = err.message || 'WS error';
        if (socket.readyState !== 1) reject(err);
      };

      socket.once('open', onOpen);
      socket.once('error', onError);
      socket.on('message', (data) => this.onMessage(data));
      socket.on('close', () => this.onClose());
    });
  }

  private onClose(): void {
    this.ws = null;
    if (this.intentionalClose || !this.accessToken || this.wanted.size === 0) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const wait = this.backoffMs;
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      void this.ensureConnected(this.accessToken!).catch((e) => {
        this.lastError = e instanceof Error ? e.message : 'reconnect failed';
      });
    }, wait);
  }

  private sendSubUnsub(method: 'sub' | 'unsub', keys: string[]): void {
    if (!this.ws || this.ws.readyState !== 1 || keys.length === 0) return;
    const payload = {
      guid: `pf-${Date.now().toString(36)}`,
      method,
      data: {
        mode: 'ltpc',
        instrumentKeys: keys,
      },
    };
    // V3 expects binary frames for subscribe requests
    this.ws.send(Buffer.from(JSON.stringify(payload)));
  }

  private onMessage(data: any): void {
    try {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      if (buf.length === 0) return;

      const message = getFeedResponseType().decode(buf);
      const obj = getFeedResponseType().toObject(message, {
        longs: String,
        enums: String,
        defaults: true,
      }) as FeedDecoded;

      const feeds = obj.feeds || {};
      const now = Date.now();
      const iso = new Date(now).toISOString();

      for (const [instrumentKey, feed] of Object.entries(feeds)) {
        const ltp = extractLtp(feed);
        if (ltp == null) continue;
        const entry = { ltp, ts: now };
        for (const key of keyVariants(instrumentKey)) {
          this.ltpCache.set(key, entry);
        }
        this.lastTickAt = iso;
        for (const h of this.handlers) {
          try {
            h(instrumentKey, ltp, now);
          } catch {
            /* handler errors must not kill the feed */
          }
        }
      }
    } catch (e) {
      // Heartbeats / market_info without feeds are fine; only log decode hard-fails sparingly
      this.lastError = e instanceof Error ? e.message : 'decode failed';
    }
  }
}

/** Module singleton — PinaxForge paper desk only. */
export const pinaxUpstoxWsFeed = new PinaxUpstoxWsFeed();

export const WS_LTP_FRESH_MS = FRESH_MS;
