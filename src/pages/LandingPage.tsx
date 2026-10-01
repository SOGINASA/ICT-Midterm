import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Check,
  ChevronDown,
  Menu,
  Smartphone,
  X,
} from "lucide-react";
import LandingPreview from "../components/LandingPreview";
import AnimatedDetails from "../components/AnimatedDetails";
import Presence from "../components/Presence";
import { useAuthStore } from "../store/useAuthStore";
import "./landing.css";

const navigation = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#about", label: "The project" },
];
const questions = [
  {
    question: "Can I try it before creating an account?",
    answer:
      "Yes. Try demo opens a sample workspace with expenses and budgets to explore. Demo changes stay in this browser and are separate from your account.",
  },
  {
    question: "Does TengeFlow connect to my bank?",
    answer:
      "No bank connection, card details, or banking passwords. You add your own expenses, and TengeFlow helps you see where they go. All amounts are in Kazakhstani tenge (KZT).",
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes. Open TengeFlow in your phone’s browser. Expense entry, budgets, and insights adapt to your screen, with no app store download needed. You need an internet connection to sign in and save account data.",
  },
  {
    question: "Where does my data live?",
    answer:
      "The demo saves its sample data in this browser. When account services are connected, your personal workspace saves the expenses and budgets you add to your account. Demo data never becomes your account data automatically.",
  },
];
function Wordmark() {
  return (
    <Link to="/" className="tf-wordmark" aria-label="TengeFlow home">
      <span className="tf-wordmark-symbol" aria-hidden="true">
        ₸
      </span>
      tengeflow<span className="tf-wordmark-dot">.</span>
    </Link>
  );
}
function Illustration({
  name,
  alt,
  hero = false,
}: {
  name: string;
  alt: string;
  hero?: boolean;
}) {
  return (
    <img
      src={`/images/landing/${name}-1024.webp`}
      srcSet={`/images/landing/${name}-640.webp 640w, /images/landing/${name}-1024.webp 1024w, /images/landing/${name}-1536.webp 1536w`}
      sizes={
        hero
          ? "(max-width: 760px) calc(100vw - 40px), (max-width: 1360px) 54vw, 720px"
          : "(max-width: 760px) calc(100vw - 40px), (max-width: 1360px) 46vw, 592px"
      }
      width={1536}
      height={1024}
      alt={alt}
      loading={hero ? "eager" : "lazy"}
      decoding="async"
      {...(hero ? { fetchpriority: "high" } : {})}
    />
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const { ready, session, recovery, demo, acceptSession } = useAuthStore();
  const signedIn = !!session && !recovery && !session.recovery;
  function accountAction(guestLabel: string, className: string, icon?: ReactNode, guestPath = "/register") {
    if (!ready) {
      return <span className={`${className} tf-auth-placeholder`} aria-hidden="true">{guestLabel}{icon}</span>;
    }
    return (
      <Link
        to={signedIn ? "/app" : guestPath}
        className={className}
        onClick={() => {
          setMenuOpen(false);
          if (signedIn && session && demo) acceptSession(session);
        }}
      >
        {signedIn ? "В приложение" : guestLabel}{icon}
      </Link>
    );
  }
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const wideScreen = window.matchMedia("(min-width: 761px)");
    const closeOnResize = () => {
      if (wideScreen.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOutside);
    wideScreen.addEventListener("change", closeOnResize);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOutside);
      wideScreen.removeEventListener("change", closeOnResize);
    };
  }, [menuOpen]);
  return (
    <div className="tf-home">
      <a href="#landing-content" className="tf-skip">
        Skip to content
      </a>
      <header className="tf-header" ref={header}>
        <div className="tf-container tf-header-inner">
          <Wordmark />
          <nav className="tf-desktop-nav" aria-label="Site navigation">
            {navigation.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="tf-header-actions">
            {ready && !signedIn && <Link to="/login" className="tf-sign-in">Sign in</Link>}
            {accountAction("Get started", "tf-button tf-button-small", <ArrowUpRight size={16} aria-hidden="true" />)}
          </div>
          <button
            ref={menuButton}
            className="tf-menu-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
        <Presence present={menuOpen} className="tf-mobile-menu">
          <nav
            id="landing-mobile-menu"
            className="tf-mobile-nav"
            aria-label="Mobile site navigation"
          >
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ))}
            <div className="tf-mobile-nav-actions" data-signed-in={signedIn}>
              {ready && !signedIn && <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="tf-button tf-button-outline"
              >
                Sign in
              </Link>}
              {accountAction("Get started", "tf-button")}
            </div>
          </nav>
        </Presence>
      </header>
      <main id="landing-content" tabIndex={-1}>
        <section className="tf-container tf-hero" aria-labelledby="hero-title">
          <div className="tf-hero-copy">
            <p className="tf-kicker">
              <Asterisk size={18} strokeWidth={1.5} aria-hidden="true" />{" "}
              Personal finance / Kazakhstan
            </p>
            <h1 id="hero-title">
              A little clarity.
              <br />A lot more <em>life.</em>
            </h1>
            <p className="tf-hero-description">
              Coffee with friends. The ride home. Your next big plan. Keep track
              of your tenge, and make room for all of it.
            </p>
            <div className="tf-hero-actions">
              {accountAction("Create account", "tf-button", <ArrowUpRight size={18} aria-hidden="true" />)}
              <Link to="/demo" className="tf-text-link">
                Try demo{" "}
                <span className="tf-arrow-circle">
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </Link>
            </div>
            <p className="tf-hero-note">
              Your everyday expense tracker. No bank details needed.
            </p>
          </div>
          <figure className="tf-hero-art">
            <Illustration
              name="almaty-everyday"
              alt="Three friends outside an Almaty café, with a bicycle, leafy streets, and the mountains behind them."
              hero
            />
            <figcaption>
              <span>A little more present. A little more planned.</span>
              <span>
                Almaty, KZ <ArrowUpRight size={12} aria-hidden="true" />
              </span>
            </figcaption>
          </figure>
        </section>
        <div className="tf-container">
          <div className="tf-principles" aria-label="Made for your everyday">
            <p>
              <span className="tf-tenge" aria-hidden="true">
                ₸
              </span>{" "}
              Made for life in tenge
            </p>
            <p>
              <Check size={18} strokeWidth={1.5} aria-hidden="true" /> Just your
              expenses. Just your space.
            </p>
            <p>
              <Smartphone size={18} strokeWidth={1.5} aria-hidden="true" /> At
              home on your phone
            </p>
          </div>
        </div>
        <section id="how-it-works" className="tf-container tf-how tf-section">
          <div className="tf-section-heading">
            <div>
              <p className="tf-kicker">01 / Find your flow</p>
              <h2>
                A small habit.
                <br />A clearer month.
              </h2>
            </div>
            <p>
              Three simple things to help you feel
              <br className="tf-desktop-break" /> more on top of your money.
            </p>
          </div>
          <div className="tf-steps">
            {[
              {
                number: "01",
                title: "Note the everyday.",
                body: "Lunch, transport, a little treat. Add an amount and category before you forget about it.",
                link: "Expense tracking",
              },
              {
                number: "02",
                title: "Give it a little structure.",
                body: "Set a monthly budget for each category. See what you’ve spent and what’s still yours to use.",
                link: "Category budgets",
              },
              {
                number: "03",
                title: "See your bigger picture.",
                body: "Find the patterns in your spending. Make your next decision with a little more perspective.",
                link: "Monthly insights",
              },
            ].map((step) => (
              <article key={step.number} className="tf-step">
                <span className="tf-step-number" aria-hidden="true">
                  {step.number}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <span className="tf-step-caption">
                  {step.link} <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </article>
            ))}
          </div>
        </section>
        <section id="features" className="tf-container tf-stories tf-section">
          <div className="tf-section-heading">
            <div>
              <p className="tf-kicker">02 / Money meets real life</p>
              <h2>
                Room for the little things.
                <br />
                And the bigger <em>plans.</em>
              </h2>
            </div>
            <span className="tf-editorial-note">
              A budget should fit your life.
            </span>
          </div>
          <div className="tf-story-grid">
            <article className="tf-story">
              <figure>
                <Illustration
                  name="cafe-moments"
                  alt="Two students sharing coffee and a conversation in a leafy Almaty café."
                />
                <figcaption>THE EVERYDAY</figcaption>
              </figure>
              <div className="tf-story-copy">
                <span className="tf-story-index">01</span>
                <div>
                  <h3>Yes to the coffee.</h3>
                  <p>
                    Small purchases are part of life. Keep them in view with
                    quick expense entry, categories, and a history you can come
                    back to.
                  </p>
                </div>
              </div>
            </article>
            <article className="tf-story tf-story-offset">
              <figure>
                <Illustration
                  name="quiet-plans"
                  alt="A student planning in her notebook by a window overlooking Almaty and the mountains."
                />
                <figcaption>THE WHAT’S NEXT</figcaption>
              </figure>
              <div className="tf-story-copy">
                <span className="tf-story-index">02</span>
                <div>
                  <h3>A little space for tomorrow.</h3>
                  <p>
                    A weekend away. A course. Something you’ve had your eye on.
                    Category budgets help you see how much room you have.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>
        <section className="tf-product-section">
          <div className="tf-container tf-product">
            <div className="tf-product-copy">
              <p className="tf-kicker">03 / Less wondering, more knowing</p>
              <h2>
                Your month.
                <br />
                All right <em>here.</em>
              </h2>
              <p>
                Your expenses, your budgets, and the patterns between them. A
                clear view of your money, whenever you need it.
              </p>
              <ul>
                <li>
                  <Check size={16} aria-hidden="true" /> Know what’s left this
                  month
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> See where the little
                  things add up
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Pick up on your phone
                  or laptop
                </li>
              </ul>
              <Link to="/demo" className="tf-text-link">
                Open the demo{" "}
                <span className="tf-arrow-circle">
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </Link>
              <p className="tf-sample-note">
                Explore with sample data. No account needed.
              </p>
            </div>
            <div className="tf-preview-wrap">
              <LandingPreview />
              <p className="tf-preview-caption">
                <span className="tf-caption-dot" /> A little preview. A clearer
                perspective.
              </p>
            </div>
          </div>
        </section>
        <section id="about" className="tf-container tf-about tf-section">
          <div>
            <p className="tf-kicker">A project with a simple idea</p>
            <h2>
              Built around
              <br />
              <em>our everyday.</em>
            </h2>
          </div>
          <div className="tf-about-copy">
            <p className="tf-about-lead">
              We think understanding your money should feel like a useful
              everyday habit.
            </p>
            <p>
              TengeFlow is an ICT student project made for life in Kazakhstan.
              From lunch between classes to the plans after graduation, it
              brings a little order to the things we spend on.
            </p>
            <p>
              One place to keep your expenses, plan your budget, and learn a
              little about your habits along the way.
            </p>
            <span className="tf-project-signature">
              <span aria-hidden="true">₸</span> Thoughtfully made for life in
              KZT.
            </span>
          </div>
        </section>
        <section
          className="tf-container tf-faq tf-section"
          aria-labelledby="faq-title"
        >
          <div>
            <p className="tf-kicker">Before you begin</p>
            <h2 id="faq-title">
              A few good
              <br />
              <em>questions.</em>
            </h2>
          </div>
          <div className="tf-questions">
            {questions.map((item, index) => (
              <AnimatedDetails
                key={item.question}
                contentClassName="tf-question-answer"
                summary={<>
                  <span className="tf-question-number">0{index + 1}</span>
                  <span>{item.question}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </>}
              >
                <p>{item.answer}</p>
              </AnimatedDetails>
            ))}
          </div>
        </section>
        <section className="tf-container tf-closing-wrap">
          <div className="tf-closing">
            <div>
              <p className="tf-kicker">A fresh page for your money</p>
              <h2>
                Here’s to finding
                <br />
                your <em>flow.</em>
              </h2>
              <p>Start with today. The little things add up.</p>
              {accountAction("Start your own story", "tf-button tf-button-paper", <ArrowUpRight size={19} aria-hidden="true" />)}
            </div>
            <div className="tf-closing-stamp" aria-hidden="true">
              <span>EVERYDAY MONEY</span>
              <b>₸</b>
              <span>A LITTLE MORE CLARITY</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="tf-container tf-footer">
        <div className="tf-footer-top">
          <div>
            <Wordmark />
            <p>A little more clarity, every day.</p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#about">About the project</a>
            <a href="#privacy">
              Your data <ArrowDown size={13} aria-hidden="true" />
            </a>
            {accountAction("Sign in", "tf-footer-account", undefined, "/login")}
            <a href="#landing-content">
              Back to top <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <div id="privacy" className="tf-footer-bottom">
          <p>
            <strong>Your data, simply:</strong> an account uses your name,
            email, and the expenses and budgets you choose to add. Demo data
            stays in this browser. No bank or card details are needed.
          </p>
          <p>
            TengeFlow · ICT student project
            <br />
            Made for Kazakhstan, in tenge.
          </p>
        </div>
      </footer>
    </div>
  );
}
