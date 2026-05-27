# Source Revenue-Sharing for myjunto: A Research Brief

**Prepared for:** Jon Tompkins
**Date:** 2026-05-27
**Question:** Should myjunto kick weekly revenue back to the X accounts whose tweets it scrapes and synthesizes? If so, how?

---

## 1. Strategic value — is this worth doing at all?

The strongest argument *for* paying sources is not the payout itself — it is the **acquisition arbitrage**. Sources are themselves audience nodes. A fintwit voice with 80k followers who tweets "myjunto.xyz pays me a tiny weekly check for citing my tweets" is the highest-conversion possible ad for the product: it is in-context, social-proofed by the author, and free. Compare this to a $5 paid CPM on X, which is what myjunto would otherwise pay to reach the same eyeballs.

This is precisely the dynamic that powered **YouTube's 2007 Partner Program launch**. YouTube did not need to share 55% of ad revenue with creators to keep them; creators had nowhere else to go. The 55% number was set high specifically as a **public commitment device** to lock in creators against Revver (40-50%) and Break.com (flat fees), and to give creators a reason to evangelize the platform to *other* creators ([Headcount Coffee, "How the 2007 YouTube Partner Program Reshaped Video"](https://www.headcountcoffee.com/blogs/media-history/youtube-partner-program-revenue-model-and-distribution-incentive-shift); [YT Money Calculator, "How the 55/45 Split Really Works"](https://ytmoneycalculator.com/blog/youtube-revenue-sharing/)). Within a year YouTube had creators earning $100k+, which became the recruitment story.

**The competitive moat argument is real but narrow.** If myjunto pays even $20/mo to each of the top 100 fintwit voices, a copycat aggregator has to either (a) match the economics on a smaller subscriber base, or (b) operate without those sources' goodwill and have them publicly snipe at the clone. This is the dynamic Spotify can never escape with labels — once the major labels were paid, no challenger could enter without paying them too. But note: Spotify's payment is *legally compelled*; myjunto's would be *voluntary*. Voluntary moats are weaker because a competitor can simply not pay and pocket the margin.

**The quality argument is mostly wrong.** X's Creator Revenue Sharing produced the opposite — engagement farming, ragebait, and bot-coordinated reply amplification ([Petrusenko, "Engagement Farming Redesigned"](https://medium.com/dare-to-be-better/engagement-farming-redesigned-the-twitter-x-bot-wars-for-payouts-b7f2d9bb3854); [X Help, Creator Revenue Sharing](https://help.x.com/en/using-x/creator-revenue-sharing)). myjunto would not be paying for engagement, but paying for *citation* still creates an attack surface (write 50 trader-style tweets/day to maximize chance of being cited).

**Verdict on strategic value:** The viral-acquisition case is strong; the moat case is moderate; the quality case is weak. Net: worth running as a marketing experiment, not as a structural model.

---

## 2. Analogs — who has done this and what happened?

### YouTube Partner Program (2007–)
55/45 split (creator/platform), now requires 1,000 subscribers + 4,000 watch hours in 12 months ([Google Help, YPP Overview](https://support.google.com/youtube/answer/72851)). Originally had no threshold. Worked spectacularly: by 2021 over 2 million creators were in the program ([Variety, 2021](https://variety.com/2021/digital/news/youtube-partner-program-2-million-creators-1235045674/)). The lesson for myjunto: **a generous, publicly committed rev share with a low entry bar can be the entire growth strategy** if the platform is the only credible distributor.

### Spotify (pro-rata royalty pool)
~2/3 of revenue paid out, no fixed per-stream rate; effective $0.003-0.005/stream. In April 2024 Spotify added a **1,000-stream/12-month floor** before any track is eligible — explicitly framed as fraud mitigation but heavily criticized as a wealth transfer to large artists ([iMusician, "Spotify Royalty Model Changes April 2024"](https://imusician.pro/en/resources/blog/spotify-royalty-model-changes-in-effect-since-april-2024)). Discovery Mode, which trades a reduced royalty for algorithmic promotion, hit 26% of indie streams in 2024, up from 13% in 2023 ([Digital Music News, Jan 2025](https://www.digitalmusicnews.com/2025/01/24/apple-music-royalty-rate-spotify-study/)). Lesson: **a pool model with a minimum-activity floor is the standard fraud control**; expect to be accused of favoring big accounts.

### X Creator Revenue Sharing (July 2023–)
~$8-12 per million verified impressions, biweekly payout, $30 minimum, requires X Premium + 5M organic impressions in 90 days ([Influencer Marketing Hub, X Ads Revenue Sharing](https://influencermarketinghub.com/x-twitter-ads-revenue-sharing/); [X Legal, Creator Revenue Sharing Terms](https://legal.x.com/en/creator-revenue-sharing-terms.html)). Outcome has been a PR mixed-bag: the headline numbers attracted creators, but the program has been dogged by bot/engagement-farming controversies and opacity (creators can't see real-time earnings). Lesson: **opacity + ragebait incentives = brand damage**.

### Medium Partner Program
Reset on Aug 1, 2023 after coordinated fake-engagement rings drained the pool ([Quora, "Medium changes Aug 2023"](https://www.quora.com/Has-anyone-who-writes-on-Medium-experienced-a-decrease-in-Partner-Program-earnings-since-they-implemented-changes-in-the-way-earnings-are-calculated-on-August-1-2023); [Medium Help, "Earnings Calculation"](https://help.medium.com/hc/en-us/articles/360036691193)). New formula: 30-second "read" / total views, weighted by member reads. Referral bonus killed the same day. $10 payout floor. Lesson: **any payout based on a proxy metric will be gamed within months**.

### Substack Referrals
50% revenue share to referring publishers ([Substack Support](https://support.substack.com/hc/en-us/articles/8946512015892)). Useful contrast: Substack pays the **referrer**, not the **content source**. The mechanic is closer to affiliate marketing than to what myjunto is contemplating.

### Reddit Contributor Program (Sept 2023–)
$0.90/gold for 100-4,999 karma, $1/gold above 5,000 karma. US-only, Persona + Stripe identity verification, 10-gold/30-day minimum, only SFW posts ([TechCrunch, Sept 2023](https://techcrunch.com/2023/09/25/reddit-will-start-paying-you-real-money-for-your-karma/)). The KYC overhead is the salient detail for myjunto — Reddit chose to gate this hard rather than scale globally.

### Apple News+ / Google News Showcase
Apple pays publishers based on **engaged minutes** ([Digital Content Next, Aug 2025](https://digitalcontentnext.org/blog/2025/08/07/inside-3-premium-publishers-apple-news-strategies/)). Google News Showcase committed $1B globally as direct flat-fee licensing ([Google blog, News Showcase](https://blog.google/outreach-initiatives/google-news-initiative/google-news-showcase/)). Both are **negotiated B2B licensing**, not open pools. This is the model that produces stable supply but no viral effect.

### AI Training Data Licensing — closest legal analog
- **OpenAI ↔ Axel Springer** (Dec 2023): ~$13M/year × 3 years (~$39M total), covers Politico, Bild, Business Insider, Welt ([the-decoder.com](https://the-decoder.com/axel-springer-and-openai-license-agreement-is-worth-tens-of-millions-of-euros-per-year/)).
- **Google ↔ Reddit** (Feb 2024): ~$60M/year ([Best Lawyers, "Reddit's Lawsuit"](https://www.bestlawyers.com/article/reddit-lawsuit-could-change-how-much-ai-knows-about-you/6905)).
- **OpenAI ↔ Reddit** (2024–25): ~$70M ([same source](https://www.bestlawyers.com/article/reddit-lawsuit-could-change-how-much-ai-knows-about-you/6905)).
- **Reddit v. Anthropic** (2025): Anthropic declined to license; Reddit sued; case in mediation Aug 2025 ([CPO Magazine](https://www.cpomagazine.com/data-protection/reddit-sues-anthropic-over-unauthorized-ai-training/)).

The pattern: **flat-fee B2B licensing with the largest content owners is now the established norm**. The smaller, distributed creator-revshare model has been tried (X, Reddit, Medium) and is uniformly problematic. The Reddit-Anthropic suit is the case to watch — it tests whether platforms can compel licensing on AI products built from scraped public posts.

### Failure: Genius / RapGenius
Never paid contributors money — only IQ points. The company struggled to monetize annotations and remained subscale, with most traffic from lyric-seekers ([Wikipedia, Genius](https://en.wikipedia.org/wiki/Genius_(company)); [HBS Digital, "Annotating the World"](https://d3.harvard.edu/platform-digit/submission/genius-annotating-the-world-one-rap-at-a-time/)). Lesson: gamification without cash works for a small superuser tier but does not scale into a defensible economic flywheel.

### Web3 tipping (Farcaster, Lens, Audius)
Top Lens users earn ~$1,300/mo via Collect + tipping ([Gate.com, Lens vs Farcaster](https://www.gate.com/learn/articles/lens-vs-farcaster-the-battle-of-web3-social-media-platforms/2554)). Audius claims 7M MAU, 250k artists ([same](https://www.gate.com/learn/articles/lens-vs-farcaster-the-battle-of-web3-social-media-platforms/2554)). None has produced a sustained media product comparable to Spotify/YouTube. Useful as a mechanic reference (pseudonymous wallets, micro-payouts) but not as proof of model.

---

## 3. Specific mechanics — design recommendations

### Design A — Lightweight Tipping Leaderboard (recommended for v1)
- **Pool:** 10% of net subscription revenue, posted publicly each week.
- **Allocation:** Per-source credits = number of times the source was cited in synthesis prompts, weighted 1.0 for a direct quote, 0.3 for "background context" inclusion.
- **Floor:** Source must have ≥5 cited tweets in the 30-day window (Spotify-style anti-fraud minimum).
- **Claim flow:** Public weekly leaderboard at `myjunto.xyz/sources`. Each entry shows the X handle and an unclaimed-credit balance. Source claims by signing in with X OAuth; credits convert at a posted $/credit rate.
- **Payout floor:** $25 (low enough to feel real, high enough to amortize Stripe fees).
- **Unclaimed:** After 90 days, unclaimed credits move to a charity pool (donor-advised; let the source pick from a curated list of 5 when they eventually claim, otherwise it flows to a default e.g. GiveDirectly).
- **PR angle:** "We paid out $X to N sources this month, $Y went to charity" — weekly tweet from @myjunto.

### Design B — Earned Credits (no cash by default)
- Credits accrue pseudonymously and **redeem inside the product**: free month of Pro, gift-a-month to a friend, or cash out above $50.
- Drastically reduces 1099 surface (in-platform credit is not reportable until cashed out) and international tax mess.
- Weaker as a marketing flywheel — "myjunto gave me a free month" is a less compelling tweet than "myjunto sent me $43."
- Best as a **fallback** for users who don't want to KYC.

### Design C — AI-Licensing Concierge (top 50 only)
- Reach out to 30-50 top fintwit voices with **flat $200-500/mo deals**, modeled on the OpenAI-Axel Springer mechanic at micro-scale.
- Smaller universe, deeper relationships, defensible PR ("myjunto licenses content from real fintwit voices like @X, @Y, @Z").
- Cost: ~$15k/mo at the top end. At 3,000 Pro subs ($5/mo) that is 100% of revenue; at 10k subs it's 30%. **Only viable post-PMF.**
- Risk: turns sources into stakeholders with veto opinions on the product.

### Tax / fraud / international
- **US 1099-NEC:** threshold is $600 in 2025, rising to $2,000 in 2026 ([OnPay, 2025](https://onpay.com/insights/1099-reporting-threshold-updates/); [Tipalti, 2026](https://tipalti.com/blog/1099-rules/)). Under Design A, almost no source will hit the threshold in year one, but track everyone over $400 conservatively.
- **International:** Use Stripe Connect / Wise — Stripe handles W-8BEN collection. Limit payouts to Stripe-supported countries initially.
- **Charity routing:** Use Every.org or PayPal Giving Fund as the intermediary so myjunto never holds the funds in a way that creates regulatory exposure.
- **Sybil defense:** require ≥2,000 follower minimum + account age ≥1 year on X for any account to receive credits. Re-verify quarterly. Manually review any source whose citation rate jumps >5x week-over-week.

---

## 4. Risks

### X ToS
The X Developer Agreement defines "Commercial Use" broadly and forbids creating "derivative works" of Licensed Material ([X Developer Agreement](https://developer.x.com/en/more/developer-terms/agreement-and-policy)). myjunto already operates in a gray zone by ingesting tweets via Apify (third-party scraper, not the X API). **Paying sources does not directly worsen the ToS posture** — if anything, public attribution + payment is the kind of practice that has historically reduced regulatory/platform pressure (cf. how labels' position vs. Napster vs. Spotify evolved). But it makes myjunto more visible, and visibility against X ToS is its own risk. The Bright Data v. X case (2024) found that scraping publicly available content does not necessarily breach ToS ([Courthouse News](https://www.courthousenews.com/judge-tosses-xs-contract-claims-against-data-scraping-company/)), which is a tailwind, but X could update terms at any time.

### Copyright / DMCA
Tweets are copyrightable expression. myjunto's synthesis is plausibly transformative (a brief is a new editorial work commenting on many sources), but reproducing tweets verbatim in audio without permission is more exposed. Adding a revenue-share is a double-edged sword: it could be cited as evidence of commercial intent in a copyright suit, **or** as evidence of good-faith licensing practice. Net legal opinion needed.

### Sybil
Most plausible attack: someone runs 50 fake fintwit accounts, posts plausible-looking trader content, and farms credits. Mitigations: follower floor, account-age floor, citation-rate anomaly detection, manual review of any new top-50 entrant.

### Reverse adverse selection
Once "myjunto pays you to be cited" is public, engagement-farmers will reformat their content to maximize citation odds (shorter, more declarative, more "ticker + take" style). This is real and unavoidable. The mitigation is editorial: keep humans-in-the-loop on source curation, and make clear that the synthesis model penalizes formulaic content.

### Margin death-spiral
At $5/mo and 10% kickback, that's $0.50/sub/mo into the pool. At 10k subs = $5k/mo into 100 sources = $50/source/mo average. Not unsustainable. At 30% kickback you're handing back $1.50/sub/mo — that probably kills the unit economics given Apify + LLM + TTS + Stripe fees. **Cap the pool at ≤15%.**

---

## 5. Founder framing — take a position

**Do it. Now. But cheap and as a marketing experiment, not a structural commitment.**

Pre-PMF, the only thing that matters is acquisition. The expected ROI on "we pay sources" comes almost entirely from **the public claim**, not the dollars. A $200/week pool that gets posted as a weekly leaderboard tweet is the cheapest possible viral lever available to myjunto, and it costs less than one boosted-post campaign per month.

Three things to **not** do:
1. Don't promise a fixed percentage of revenue forever. Promise a **pool** that you adjust quarterly.
2. Don't build full KYC + tax infrastructure in v1. Cap individual payouts at $400/year and use Stripe Connect — under the 1099-NEC threshold, your reporting burden is near-zero ([Tipalti](https://tipalti.com/blog/who-gets-a-1099/)).
3. Don't pay before you publicly attribute. Public attribution is half the marketing value at zero cost. Run attribution-only for 30 days and measure source-driven referral traffic before turning on payment.

---

## Bottom line for Jon

- **Recommendation:** Ship Design A (lightweight tipping leaderboard, 10% pool, $25 floor, charity overflow). Treat it as a $200-500/week marketing experiment, not a permanent margin commitment. Cap individual payouts at $400/year to stay under the 1099-NEC threshold.
- **Closest analog to study:** **YouTube 2007 Partner Program** for the public-commitment-as-acquisition-lever playbook; **Medium's Aug 2023 reset** for the fraud-defense playbook you'll inevitably need.
- **Skip the AI-licensing-concierge model (Design C) until post-PMF.** It is the right long-term mechanic but it consumes scarce founder bandwidth on relationship management before there is a product to leverage.
- **First experiment to run this week:** Build the public weekly leaderboard at `/sources` showing top-cited handles with citation counts — **no payments yet**. Tweet it weekly tagging the top 10. Measure: (a) referral traffic from tagged handles, (b) reply/quote-tweet engagement on the leaderboard post, (c) whether any tagged source asks "where's my check?" — that question is the buying signal that justifies turning on payments.
- **Hard guardrails before turning payments on:** ≥2,000 follower minimum, ≥1-year account age, ≥5 citations in 30 days, quarterly re-verification, manual review of any new top-50 entrant. Pool capped at 15% of net revenue. Stripe Connect for payouts; charity overflow via Every.org.
- **Single biggest risk to internalize:** the reverse adverse selection problem. The day this program goes live, smart fintwit operators will reformat their tweets to be more citable. That's not a bug, that's a fact of the system — editorially compensate for it by keeping source curation human-in-the-loop.
