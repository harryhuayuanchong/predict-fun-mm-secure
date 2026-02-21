/**
 * Tests for the market maker quoting engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Quoter } from '../src/mm/quoter.js';
import type { Orderbook } from '../src/api/client.js';

const defaultConfig = {
  baseSpread: 0.02,
  minSpread: 0.01,
  maxSpread: 0.08,
  orderSizeUsd: 10,
  maxPositionUsd: 100,
  inventorySkewFactor: 0.15,
  volEmaAlpha: 0.2,
  touchBufferBps: 10,
  orderDepthUsage: 0.3,
};

function makeOrderbook(
  bestBid: number,
  bestAsk: number,
  bidDepth = 100,
  askDepth = 100
): Orderbook {
  return {
    tokenId: 'test-token',
    bids: [
      { price: bestBid, shares: bidDepth },
      { price: bestBid - 0.01, shares: bidDepth * 2 },
    ],
    asks: [
      { price: bestAsk, shares: askDepth },
      { price: bestAsk + 0.01, shares: askDepth * 2 },
    ],
    bestBid,
    bestAsk,
    spread: bestAsk - bestBid,
    midPrice: (bestBid + bestAsk) / 2,
  };
}

describe('Quoter', () => {
  it('returns valid bid/ask quotes', () => {
    const quoter = new Quoter(defaultConfig);
    const book = makeOrderbook(0.48, 0.52);
    const quote = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });

    assert.ok(quote !== null, 'Should return a quote');
    assert.ok(quote.bidPrice > 0, 'Bid > 0');
    assert.ok(quote.askPrice < 1, 'Ask < 1');
    assert.ok(quote.bidPrice < quote.askPrice, 'Bid < Ask');
    assert.ok(quote.bidShares > 0, 'Bid shares > 0');
    assert.ok(quote.askShares > 0, 'Ask shares > 0');
  });

  it('returns null for invalid orderbook', () => {
    const quoter = new Quoter(defaultConfig);

    // No bids
    const noBids = makeOrderbook(0, 0.52);
    assert.strictEqual(quoter.calculateQuote(noBids, { yesAmount: 0, noAmount: 0 }), null);

    // Crossed book
    const crossed = makeOrderbook(0.55, 0.50);
    assert.strictEqual(quoter.calculateQuote(crossed, { yesAmount: 0, noAmount: 0 }), null);
  });

  it('returns null for very wide book', () => {
    const quoter = new Quoter(defaultConfig);
    const wide = makeOrderbook(0.20, 0.80); // 60c spread on 50c mid = 120%
    assert.strictEqual(quoter.calculateQuote(wide, { yesAmount: 0, noAmount: 0 }), null);
  });

  it('respects touch buffer — never crosses top of book', () => {
    const quoter = new Quoter(defaultConfig);
    const book = makeOrderbook(0.50, 0.52);
    const quote = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });

    assert.ok(quote !== null);
    assert.ok(quote.bidPrice <= 0.50, `Bid ${quote.bidPrice} should be <= best bid 0.50`);
    assert.ok(quote.askPrice >= 0.52, `Ask ${quote.askPrice} should be >= best ask 0.52`);
  });

  it('skews quotes with inventory bias (long YES)', () => {
    const quoter = new Quoter(defaultConfig);
    const book = makeOrderbook(0.48, 0.52);

    const neutral = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });
    quoter.reset();
    const longYes = quoter.calculateQuote(book, { yesAmount: 50, noAmount: 0 });

    assert.ok(neutral !== null && longYes !== null);

    // When long YES, bid should be lower (less eager to buy) and/or ask lower (eager to sell)
    assert.ok(
      longYes.bidPrice <= neutral.bidPrice,
      `Long YES bid ${longYes.bidPrice} <= neutral bid ${neutral.bidPrice}`
    );
  });

  it('skews quotes with inventory bias (long NO)', () => {
    const quoter = new Quoter(defaultConfig);
    const book = makeOrderbook(0.48, 0.52);

    const neutral = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });
    quoter.reset();
    const longNo = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 50 });

    assert.ok(neutral !== null && longNo !== null);

    // When long NO, ask should be higher (less eager to sell) and/or bid higher (eager to buy)
    assert.ok(
      longNo.askPrice >= neutral.askPrice,
      `Long NO ask ${longNo.askPrice} >= neutral ask ${neutral.askPrice}`
    );
  });

  it('produces wider spread with higher base spread config', () => {
    const narrowQuoter = new Quoter({ ...defaultConfig, baseSpread: 0.01 });
    const wideQuoter = new Quoter({ ...defaultConfig, baseSpread: 0.06 });

    const book = makeOrderbook(0.45, 0.55);

    const narrow = narrowQuoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });
    const wide = wideQuoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });

    assert.ok(narrow !== null && wide !== null);
    const narrowSpread = narrow.askPrice - narrow.bidPrice;
    const wideSpread = wide.askPrice - wide.bidPrice;
    assert.ok(
      wideSpread >= narrowSpread,
      `Wide spread ${wideSpread} >= narrow spread ${narrowSpread}`
    );
  });

  it('clamps prices to [0.01, 0.99]', () => {
    const quoter = new Quoter(defaultConfig);
    const extremeBook = makeOrderbook(0.02, 0.04);
    const quote = quoter.calculateQuote(extremeBook, { yesAmount: 0, noAmount: 0 });

    if (quote) {
      assert.ok(quote.bidPrice >= 0.01, `Bid ${quote.bidPrice} >= 0.01`);
      assert.ok(quote.askPrice <= 0.99, `Ask ${quote.askPrice} <= 0.99`);
    }
  });

  it('caps order size by depth usage', () => {
    const quoter = new Quoter({ ...defaultConfig, orderDepthUsage: 0.1 });
    const book = makeOrderbook(0.48, 0.52, 10, 10); // Very thin book (10 shares each)
    const quote = quoter.calculateQuote(book, { yesAmount: 0, noAmount: 0 });

    if (quote) {
      // With 10 shares at top and 0.1 depth usage, cap is 1 share (floor of 10*0.1=1)
      // But top 3 levels combined = 10 + 20 = 30, so 30*0.1 = 3
      assert.ok(quote.bidShares <= 30 * 0.1 + 1, 'Bid shares capped by depth');
      assert.ok(quote.askShares <= 30 * 0.1 + 1, 'Ask shares capped by depth');
    }
  });
});
