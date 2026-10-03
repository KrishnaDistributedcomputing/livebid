"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Bookmark,
  Boxes,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Compass,
  Eye,
  Flame,
  Gavel,
  Heart,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Package,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  Truck,
  Users,
  Video,
  Volume2,
  X,
  Zap,
} from "lucide-react";

type View = "discover" | "market" | "orders" | "studio";
type PanelTab = "bids" | "chat";

type ShowCard = {
  id: number;
  title: string;
  seller: string;
  category: string;
  viewers: string;
  image: string;
  live: boolean;
  time?: string;
};

const shows: ShowCard[] = [
  {
    id: 1,
    title: "Rare pulls and rookie heat",
    seller: "Maya Collects",
    category: "Cards",
    viewers: "1.8K",
    image: "/livebid-cards.jpg",
    live: true,
  },
  {
    id: 2,
    title: "Archive sneakers under $200",
    seller: "SOLE ROOM",
    category: "Sneakers",
    viewers: "842",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
    live: true,
  },
  {
    id: 3,
    title: "Analog cameras, tested live",
    seller: "Grain House",
    category: "Cameras",
    viewers: "519",
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85",
    live: true,
  },
  {
    id: 4,
    title: "Vintage watches: clean dials",
    seller: "Second Hand",
    category: "Watches",
    viewers: "314 going",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85",
    live: false,
    time: "8:30 PM",
  },
];

const products = [
  {
    id: 1,
    name: "Air Max 1 '86 OG",
    seller: "SOLE ROOM",
    price: 165,
    condition: "New",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 2,
    name: "Olympus OM-1 + 50mm",
    seller: "Grain House",
    price: 219,
    condition: "Excellent",
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 3,
    name: "Minimal steel automatic",
    seller: "Second Hand",
    price: 285,
    condition: "Very good",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: 4,
    name: "Structured leather tote",
    seller: "The Edit",
    price: 148,
    condition: "New",
    image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85",
  },
];

const initialMessages = [
  { id: 1, user: "patchcollector", text: "Centering looks so clean", tone: "blue" },
  { id: 2, user: "rookiecardz", text: "Can we see the back?", tone: "coral" },
  { id: 3, user: "jay.m", text: "That surface is sharp", tone: "aqua" },
];

const navigation: Array<{ view: View; label: string; icon: LucideIcon }> = [
  { view: "discover", label: "Discover", icon: Compass },
  { view: "market", label: "Market", icon: Store },
  { view: "orders", label: "Orders", icon: Package },
  { view: "studio", label: "Studio", icon: Video },
];

function Photo({
  src,
  label,
  className = "",
  children,
}: {
  src: string;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`photo ${className}`}
      style={{ backgroundImage: `url("${src}")` }}
      role="img"
      aria-label={label}
    >
      {children}
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function LiveBidApp() {
  const [view, setView] = useState<View>("discover");
  const [panelTab, setPanelTab] = useState<PanelTab>("bids");
  const [currentPrice, setCurrentPrice] = useState(83);
  const [bidIncrement, setBidIncrement] = useState(1);
  const [remaining, setRemaining] = useState(18);
  const [bidCount, setBidCount] = useState(27);
  const [leader, setLeader] = useState("cardboardhero");
  const [followed, setFollowed] = useState(false);
  const [savedShows, setSavedShows] = useState<number[]>([]);
  const [cartCount, setCartCount] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [maxBid, setMaxBid] = useState("");
  const [privateMax, setPrivateMax] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const [toast, setToast] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bidFeed, setBidFeed] = useState([
    { id: 1, user: "cardboardhero", amount: 83, time: "4s" },
    { id: 2, user: "slab.seeker", amount: 82, time: "11s" },
    { id: 3, user: "patchcollector", amount: 79, time: "18s" },
    { id: 4, user: "mintcondition", amount: 76, time: "24s" },
  ]);

  const auctionEnded = remaining === 0;
  const nextBid = currentPrice + bidIncrement;

  useEffect(() => {
    if (auctionEnded) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [auctionEnded]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleShows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return shows.filter((show) => {
      const matchesCategory = category === "All" || show.category === category;
      const matchesQuery =
        !query ||
        show.title.toLowerCase().includes(query) ||
        show.seller.toLowerCase().includes(query) ||
        show.category.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [category, searchQuery]);

  function changeView(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function placeBid() {
    if (auctionEnded) {
      setToast("This auction has ended");
      return;
    }

    const acceptedAmount = nextBid;
    setCurrentPrice(acceptedAmount);
    setLeader("You");
    setBidCount((count) => count + 1);
    setBidFeed((feed) => [
      { id: Date.now(), user: "You", amount: acceptedAmount, time: "now" },
      ...feed,
    ].slice(0, 6));
    setRemaining((seconds) => {
      if (seconds <= 5) {
        setToast(`Bid accepted at ${formatMoney(acceptedAmount)}. Timer extended.`);
        return 5;
      }
      setToast(`You are leading at ${formatMoney(acceptedAmount)}`);
      return seconds;
    });
  }

  function submitMaxBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(maxBid);
    if (!Number.isFinite(amount) || amount < nextBid) {
      setToast(`Maximum must be at least ${formatMoney(nextBid)}`);
      return;
    }
    setPrivateMax(amount);
    setMaxBid("");
    setToast("Private maximum saved");
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessages((items) => [
      ...items,
      { id: Date.now(), user: "you", text, tone: "lime" },
    ]);
    setMessage("");
  }

  function toggleSavedShow(id: number) {
    setSavedShows((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  function addToCart(name: string) {
    setCartCount((count) => count + 1);
    setToast(`${name} added to your bag`);
  }

  const pageTitles: Record<View, { eyebrow: string; title: string }> = {
    discover: { eyebrow: "Friday, live now", title: "Find your next favorite thing." },
    market: { eyebrow: "Buy it now", title: "The marketplace" },
    orders: { eyebrow: "Buyer account", title: "Your purchases" },
    studio: { eyebrow: "Seller workspace", title: "Studio overview" },
  };

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <button className="brand-mark" onClick={() => changeView("discover")} aria-label="LiveBid home">
          <Zap size={22} strokeWidth={2.7} />
        </button>
        <nav className="rail-nav">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.view}
                className={`rail-link ${view === item.view ? "is-active" : ""}`}
                onClick={() => changeView(item.view)}
                aria-label={item.label}
                title={item.label}
              >
                <Icon size={21} strokeWidth={view === item.view ? 2.6 : 2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="profile-avatar" type="button" aria-label="Open profile">KV</button>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div className="mobile-brand">
            <button className="brand-mark" onClick={() => changeView("discover")} aria-label="LiveBid home">
              <Zap size={20} strokeWidth={2.7} />
            </button>
            <span>LIVEBID</span>
          </div>

          <div className="view-heading">
            <span>{pageTitles[view].eyebrow}</span>
            <strong>{pageTitles[view].title}</strong>
          </div>

          <label className="search-box">
            <Search size={18} />
            <span className="sr-only">Search shows, products, and sellers</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search shows, products, sellers"
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="topbar-actions">
            <button className="sell-button" type="button" onClick={() => changeView("studio")}>
              <Video size={17} />
              Go live
            </button>
            <div className="popover-anchor">
              <IconButton label="Notifications" active={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
                <Bell size={19} />
                <span className="notification-dot" />
              </IconButton>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="popover-title"><strong>Notifications</strong><span>2 new</span></div>
                  <button type="button" onClick={() => changeView("orders")}>
                    <Truck size={18} />
                    <span><strong>Your order is moving</strong><small>Package arrived at the regional hub</small></span>
                  </button>
                  <button type="button" onClick={() => setPanelTab("bids")}>
                    <Gavel size={18} />
                    <span><strong>Maya Collects is live</strong><small>The next rookie card is on deck</small></span>
                  </button>
                </div>
              )}
            </div>
            <div className="bag-button-wrap">
              <IconButton label={`Shopping bag with ${cartCount} items`} onClick={() => changeView("market")}>
                <ShoppingBag size={19} />
              </IconButton>
              <span className="bag-count">{cartCount}</span>
            </div>
            <IconButton label="Open menu" className="menu-button" onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </IconButton>
          </div>
        </header>

        <main className="content-area">
          {view === "discover" && (
            <>
              <section className="live-stage" aria-label="Featured live auction">
                <Photo
                  src="/livebid-cards.jpg"
                  label="Three vintage Seattle Sounders trading cards"
                  className="live-video"
                >
                  <div className="video-shade" />
                  <div className="video-topline">
                    <div className="live-pill"><span /> LIVE</div>
                    <div className="viewer-pill"><Eye size={15} /> 1,842</div>
                    <div className="video-actions">
                      <IconButton label="Mute stream"><Volume2 size={18} /></IconButton>
                      <IconButton label="Share stream"><Share2 size={18} /></IconButton>
                      <IconButton label="More stream options"><MoreHorizontal size={19} /></IconButton>
                    </div>
                  </div>
                  <div className="video-center-action">
                    <button type="button" aria-label="Play live stream"><Play size={28} fill="currentColor" /></button>
                  </div>
                  <div className="video-caption">
                    <div className="seller-line">
                      <span className="seller-avatar">MC</span>
                      <div><strong>Maya Collects <ShieldCheck size={16} /></strong><span>@mayacollects · 14.2K followers</span></div>
                      <button type="button" className={followed ? "follow-button is-following" : "follow-button"} onClick={() => setFollowed((value) => !value)}>
                        {followed ? <><Check size={16} /> Following</> : <><Plus size={16} /> Follow</>}
                      </button>
                    </div>
                    <h1>Friday night archive rush</h1>
                    <p>Fresh slabs, low starts, and no reserves. Lot 18 of 42.</p>
                  </div>
                </Photo>

                <aside className="auction-desk">
                  <div className="auction-item-row">
                    <Photo src="/livebid-cards.jpg" label="1980 Seattle Sounders trading-card lot" className="item-thumb" />
                    <div><span>NOW UP · LOT 18</span><strong>1980 Sounders archive trio</strong><small>Three-card original set</small></div>
                    <IconButton label="Save item"><Bookmark size={18} /></IconButton>
                  </div>

                  <div className="price-clock">
                    <div><span>Current bid</span><strong>{formatMoney(currentPrice)}</strong><small>{bidCount} bids · {leader === "You" ? "You are leading" : `@${leader} leads`}</small></div>
                    <div className={`countdown ${remaining <= 5 ? "is-urgent" : ""}`}>
                      <Clock3 size={16} />
                      <strong>0:{remaining.toString().padStart(2, "0")}</strong>
                      <span>{auctionEnded ? "ended" : "left"}</span>
                    </div>
                  </div>

                  <div className="panel-tabs" role="tablist" aria-label="Auction activity">
                    <button role="tab" aria-selected={panelTab === "bids"} className={panelTab === "bids" ? "is-active" : ""} onClick={() => setPanelTab("bids")}>Bid history</button>
                    <button role="tab" aria-selected={panelTab === "chat"} className={panelTab === "chat" ? "is-active" : ""} onClick={() => setPanelTab("chat")}>Live chat <span>{messages.length}</span></button>
                  </div>

                  {panelTab === "bids" ? (
                    <div className="bid-feed" aria-live="polite">
                      {bidFeed.map((bid, index) => (
                        <div className="bid-row" key={bid.id} style={{ animationDelay: `${index * 45}ms` } as CSSProperties}>
                          <span className={`bid-avatar tone-${index % 4}`}>{bid.user.slice(0, 1).toUpperCase()}</span>
                          <div><strong>{bid.user}</strong><small>{bid.time === "now" ? "Bid accepted now" : `${bid.time} ago`}</small></div>
                          <b>{formatMoney(bid.amount)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="chat-panel">
                      <div className="chat-feed" aria-live="polite">
                        {messages.map((item) => (
                          <div className="chat-message" key={item.id}>
                            <span className={`chat-avatar ${item.tone}`}>{item.user.slice(0, 1).toUpperCase()}</span>
                            <p><strong>{item.user}</strong>{item.text}</p>
                          </div>
                        ))}
                      </div>
                      <form className="chat-form" onSubmit={sendMessage}>
                        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Say something…" aria-label="Chat message" maxLength={180} />
                        <button type="submit" aria-label="Send message"><Send size={17} /></button>
                      </form>
                    </div>
                  )}

                  <div className="bid-controls">
                    <div className="increment-control" aria-label="Bid increment">
                      {[1, 3, 5].map((amount) => (
                        <button type="button" key={amount} className={bidIncrement === amount ? "is-active" : ""} onClick={() => setBidIncrement(amount)}>+${amount}</button>
                      ))}
                    </div>
                    <button type="button" className="primary-bid" onClick={placeBid} disabled={auctionEnded}>
                      <Gavel size={19} />
                      {auctionEnded ? "Auction ended" : `Bid ${formatMoney(nextBid)}`}
                    </button>
                    <form className="max-bid-form" onSubmit={submitMaxBid}>
                      <label><span>Max bid</span><b>$</b><input inputMode="numeric" value={maxBid} onChange={(event) => setMaxBid(event.target.value.replace(/[^0-9]/g, ""))} placeholder={String(nextBid + 20)} aria-label="Private maximum bid" /></label>
                      <button type="submit">Set max</button>
                    </form>
                    <p className="private-note"><ShieldCheck size={14} /> {privateMax ? `Private max active at ${formatMoney(privateMax)}` : "Your maximum stays private"}</p>
                  </div>
                </aside>
              </section>

              <section className="browse-section">
                <div className="section-heading">
                  <div><span>HAPPENING NOW</span><h2>Rooms with momentum</h2></div>
                  <button type="button">See all <span aria-hidden="true">→</span></button>
                </div>
                <div className="category-strip" aria-label="Show categories">
                  {["All", "Cards", "Sneakers", "Cameras", "Watches"].map((item) => (
                    <button type="button" key={item} onClick={() => setCategory(item)} className={category === item ? "is-active" : ""}>{item}</button>
                  ))}
                </div>
                <div className="show-grid">
                  {visibleShows.map((show, index) => (
                    <article className="show-card" key={show.id} style={{ animationDelay: `${index * 70}ms` }}>
                      <Photo src={show.image} label={show.title} className="show-photo">
                        <div className={`show-status ${show.live ? "is-live" : "is-upcoming"}`}>{show.live ? <><span /> LIVE</> : <><Clock3 size={13} /> {show.time}</>}</div>
                        <div className="show-viewers"><Eye size={14} /> {show.viewers}</div>
                        <button className="show-play" type="button" aria-label={`Open ${show.title}`} onClick={() => setToast(`Opening ${show.title}`)}><Play size={22} fill="currentColor" /></button>
                      </Photo>
                      <div className="show-card-body">
                        <div><span>{show.category}</span><h3>{show.title}</h3><p>{show.seller}</p></div>
                        <IconButton label={savedShows.includes(show.id) ? "Remove show reminder" : "Save show reminder"} active={savedShows.includes(show.id)} onClick={() => toggleSavedShow(show.id)}><Bookmark size={18} fill={savedShows.includes(show.id) ? "currentColor" : "none"} /></IconButton>
                      </div>
                    </article>
                  ))}
                  {visibleShows.length === 0 && <div className="empty-state"><Search size={25} /><strong>No matching rooms</strong><p>Try another seller, product, or category.</p></div>}
                </div>
              </section>
            </>
          )}

          {view === "market" && (
            <section className="market-view view-enter">
              <div className="market-toolbar">
                <div className="market-title"><span>CURATED DAILY</span><h1>Objects worth keeping.</h1><p>Verified sellers, clear condition notes, and protected checkout.</p></div>
                <button type="button" className="filter-button"><SlidersHorizontal size={17} /> Filters <ChevronDown size={15} /></button>
              </div>
              <div className="market-categories">
                {[["For you", Flame], ["Ending soon", Clock3], ["Under $100", Tag], ["Verified", ShieldCheck]].map(([label, Icon]) => {
                  const CategoryIcon = Icon as LucideIcon;
                  return <button key={label as string} type="button"><CategoryIcon size={17} />{label as string}</button>;
                })}
              </div>
              <div className="product-grid">
                {products.map((product, index) => (
                  <article className="product-card" key={product.id} style={{ animationDelay: `${index * 70}ms` }}>
                    <Photo src={product.image} label={product.name} className="product-photo">
                      <span>{product.condition}</span>
                      <IconButton label="Save product"><Heart size={18} /></IconButton>
                    </Photo>
                    <div className="product-info"><span>{product.seller}</span><h2>{product.name}</h2><div><strong>{formatMoney(product.price)}</strong><button type="button" onClick={() => addToCart(product.name)}><Plus size={16} /> Add</button></div></div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "orders" && (
            <section className="orders-view view-enter">
              <div className="order-summary-band">
                <div><span>IN TRANSIT</span><h1>It is on the way.</h1><p>Expected Saturday, October 4</p></div>
                <div className="package-visual"><Package size={54} /><span>LB</span></div>
              </div>
              <div className="order-layout">
                <article className="tracking-panel">
                  <div className="tracking-head"><div><span>USPS GROUND ADVANTAGE</span><h2>9400 1000 0000 3829 1047 22</h2></div><button type="button" onClick={() => setToast("Tracking number copied")}>Copy</button></div>
                  <div className="tracking-line" aria-label="Shipment progress">
                    {[["Order confirmed", "Sep 30", true], ["Label created", "Oct 1", true], ["In transit", "Oct 2", true], ["Delivered", "Oct 4", false]].map(([label, date, done]) => <div className={done ? "is-done" : ""} key={label as string}><span>{done ? <Check size={15} /> : null}</span><strong>{label as string}</strong><small>{date as string}</small></div>)}
                  </div>
                  <div className="latest-scan"><Truck size={20} /><div><span>LATEST UPDATE · 9:42 AM</span><strong>Departed regional distribution center</strong><small>Reno, NV</small></div></div>
                </article>
                <article className="order-item-panel">
                  <div className="order-label"><span>ORDER LB-28419</span><strong>Paid · $91.46</strong></div>
                  <Photo src="/livebid-cards.jpg" label="Purchased Seattle Sounders collectible cards" className="order-photo" />
                  <h2>1980 Sounders archive trio</h2><p>Sold by Maya Collects</p>
                  <div className="order-totals"><span>Winning bid <b>$83.00</b></span><span>Shipping + tax <b>$8.46</b></span><strong>Total <b>$91.46</b></strong></div>
                  <button type="button" className="outline-button"><MessageCircle size={17} /> Get help with this order</button>
                </article>
              </div>
            </section>
          )}

          {view === "studio" && (
            <section className="studio-view view-enter">
              <div className="studio-banner">
                <div><span>SELLER STUDIO</span><h1>Your room, your pace.</h1><p>Friday Night Finds is scheduled for 8:00 PM.</p></div>
                <button type="button" onClick={() => setToast("Camera preview ready")}><Video size={18} /> Open studio</button>
              </div>
              <div className="metric-grid">
                {[["Net revenue", "$8,420", "+18.4%", BarChart3], ["Orders", "126", "+12 today", Boxes], ["Avg. viewers", "684", "+9.2%", Users], ["Conversion", "7.8%", "+1.4 pts", Zap]].map(([label, value, trend, Icon]) => {
                  const MetricIcon = Icon as LucideIcon;
                  return <article className="metric-card" key={label as string}><div><MetricIcon size={19} /></div><span>{label as string}</span><strong>{value as string}</strong><small>{trend as string}</small></article>;
                })}
              </div>
              <div className="studio-grid">
                <article className="queue-panel">
                  <div className="panel-heading"><div><span>NEXT SHOW</span><h2>Inventory queue</h2></div><button type="button"><Plus size={17} /> Add item</button></div>
                  {products.slice(0, 3).map((product, index) => <div className="queue-row" key={product.id}><span className="queue-index">{String(index + 1).padStart(2, "0")}</span><Photo src={product.image} label={product.name} className="queue-photo" /><div><strong>{product.name}</strong><small>{index === 0 ? "Auction · $1 start" : `Buy now · ${formatMoney(product.price)}`}</small></div><button type="button" aria-label={`Options for ${product.name}`}><MoreHorizontal size={18} /></button></div>)}
                </article>
                <article className="show-checklist">
                  <div className="panel-heading"><div><span>GO-LIVE CHECK</span><h2>Room readiness</h2></div><strong>3/4</strong></div>
                  {[["Camera and microphone", true], ["Inventory assigned", true], ["Shipping profile", true], ["Moderator invited", false]].map(([label, done]) => <button type="button" key={label as string} className={done ? "is-done" : ""}><span>{done ? <Check size={15} /> : null}</span>{label as string}</button>)}
                  <div className="studio-time"><Clock3 size={18} /><div><span>STARTS IN</span><strong>2h 18m</strong></div></div>
                </article>
              </div>
            </section>
          )}
          <footer className="site-credit">
            Demo card image: Seattle Municipal Archives / Mike Knutkowski, <a href="https://creativecommons.org/licenses/by/2.0" target="_blank" rel="noreferrer">CC BY 2.0</a>
          </footer>
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.view} className={view === item.view ? "is-active" : ""} onClick={() => changeView(item.view)}><Icon size={20} /><span>{item.label}</span></button>;
          })}
        </nav>

        {menuOpen && (
          <div className="mobile-menu">
            <button type="button"><CircleUserRound size={18} /> Profile</button>
            <button type="button"><Bookmark size={18} /> Saved</button>
            <button type="button"><ShoppingBag size={18} /> Bag <span>{cartCount}</span></button>
          </div>
        )}
      </div>

      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  );
}