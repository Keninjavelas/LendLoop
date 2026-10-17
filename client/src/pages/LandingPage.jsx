import { ArrowRight, ArrowUpRight, BadgeCheck, CalendarClock, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/common/StatusBadge.jsx';
import ItemCard, { CategoryIcon } from '../components/items/ItemCard.jsx';
import { Brand } from '../components/layout/Sidebar.jsx';
import { itemService } from '../services/itemService.js';

// Literal class strings only - Tailwind's scanner cannot see values assembled at runtime.
const HEADER_GHOST_LINK =
  'inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-ink';

// A solid accent fill always carries near-black type: white on #17e88a is 1.6:1.
const HEADER_PRIMARY_LINK =
  'inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover';

const HERO_PRIMARY_LINK =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-ink transition-colors hover:bg-primary-hover';

const HERO_SECONDARY_LINK =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-raised px-6 text-base font-semibold text-ink transition-colors hover:border-faint hover:bg-line-soft';

const VIEW_ALL_LINK =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover';

const TRUST_ITEMS = [
  { icon: Sparkles, label: 'Free to use' },
  { icon: BadgeCheck, label: 'Student friendly' },
  { icon: CalendarClock, label: 'Every loan tracked' },
];

const STEPS = [
  {
    number: '01',
    title: 'List an item you already own',
    description: 'Add a title, category and condition — it appears on the shared shelf instantly.',
  },
  {
    number: '02',
    title: 'Request to borrow',
    description: 'Find something nearby, pick a return date and send the owner a one-tap request.',
  },
  {
    number: '03',
    title: 'Approve, lend, track the return',
    description: 'Accepting opens a loan with a due date, so both sides can see when it comes home.',
  },
];

// Decorative only: the live item preview below is fetched from the public API.
const HERO_ROWS = [
  { title: 'Graphing calculator', category: 'Calculators', meta: 'Lent by Amara', status: 'borrowed' },
  { title: 'Intro to Algorithms', category: 'Books & Notes', meta: 'Lent by Rohan', status: 'available' },
  { title: 'Acoustic guitar', category: 'Other', meta: 'Returned to Maya', status: 'available' },
];

export default function LandingPage() {
  const [previewItems, setPreviewItems] = useState([]);

  // The preview is a nice-to-have: if the API is unreachable or empty the whole
  // section stays hidden rather than showing an error on a marketing page.
  useEffect(() => {
    let active = true;

    itemService
      .list({ status: 'available' })
      .then((data) => {
        if (!active) return;
        setPreviewItems(Array.isArray(data?.items) ? data.items.slice(0, 3) : []);
      })
      .catch(() => {
        if (active) setPreviewItems([]);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="LendLoop home" className="shrink-0">
            <Brand />
          </Link>

          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              to="/items"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink md:inline-flex"
            >
              Browse items
            </Link>
            <Link to="/login" className={HEADER_GHOST_LINK}>
              Log in
            </Link>
            <Link to="/register" className={HEADER_PRIMARY_LINK}>
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-md bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-inset ring-primary/20">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Peer to peer borrowing
              </span>

              <h1 className="mt-5 text-4xl font-bold leading-tight text-ink sm:text-5xl">
                Borrow the things you need. Lend the things you do not.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                A drill used twice a year, a textbook for one semester, a camera for a weekend.
                LendLoop turns the stuff already sitting around your flat, dorm or street into a
                shared shelf — so nobody has to buy it, and nothing sits unused.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/register" className={HERO_PRIMARY_LINK}>
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/items" className={HERO_SECONDARY_LINK}>
                  Browse items
                </Link>
              </div>

              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
                {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="panel p-5">
              <p className="flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                <span className="eyebrow">What a shelf looks like</span>
                <span className="rounded-md bg-raised px-2 py-0.5 text-[10px] font-bold text-faint ring-1 ring-inset ring-line">
                  Illustrative
                </span>
              </p>

              <ul className="mt-4 space-y-2.5">
                {HERO_ROWS.map((row) => (
                  <li
                    key={row.title}
                    className="flex items-center gap-3 rounded-lg border border-line-soft bg-raised p-3"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <CategoryIcon category={row.category} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {row.title}
                      </span>
                      <span className="block truncate text-xs text-muted">{row.meta}</span>
                    </span>
                    <StatusBadge status={row.status} />
                  </li>
                ))}
              </ul>

              <p className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4 text-xs font-medium text-muted">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Every loan keeps its request, due date and return in one place.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">
                Three steps from shelf to borrowed and back
              </h2>
              <p className="mt-4 text-base text-muted">
                No listings fee, no chat threads to lose track of. The loop is the product.
              </p>
            </div>

            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map(({ number, title, description }) => (
                <li key={number} className="panel p-6 transition-colors hover:border-faint">
                  <p className="font-display text-3xl font-bold tabular-nums text-faint">{number}</p>
                  <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {previewItems.length > 0 && (
          <section className="border-b border-line">
            <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Live from the community</p>
                  <h2 className="mt-3 text-3xl font-bold text-ink">Available to borrow now</h2>
                </div>
                <Link to="/items" className={VIEW_ALL_LINK}>
                  View all
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {previewItems.map((item) => (
                  <ItemCard key={item._id} item={item} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            {/* Held inside a tinted panel rather than a full-bleed accent slab, so the one
                strong call to action reads as a moment instead of flooding the page. */}
            <div className="rounded-xl border border-primary/25 bg-primary-soft px-6 py-12 sm:px-12">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  Ready when you are
                </p>
                <h2 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">
                  Your shelf is already full of things worth sharing
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted">
                  Create a free account, list your first item in under a minute, and start
                  borrowing from the people around you.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/register" className={HERO_PRIMARY_LINK}>
                    Get started
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link to="/items" className={HERO_SECONDARY_LINK}>
                    Browse items
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <Brand />
            <p className="mt-3 max-w-sm text-sm text-muted">
              Borrow and lend everyday items with people around you, without the buy.
            </p>
          </div>
          <div className="md:text-right">
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-muted md:justify-end">
              <Link to="/items" className="transition-colors hover:text-ink">
                Browse items
              </Link>
              <Link to="/login" className="transition-colors hover:text-ink">
                Log in
              </Link>
              <Link to="/register" className="transition-colors hover:text-ink">
                Sign up
              </Link>
            </nav>
            <p className="mt-4 text-xs text-faint">
              LendLoop is a MongoDB CRUD demonstration project built with the MERN stack.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
