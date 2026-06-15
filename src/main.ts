import "./style.css";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Starfield } from "./starfield";

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
root.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const $ = <T extends Element = HTMLElement>(s: string, p: ParentNode = document) =>
  p.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, p: ParentNode = document) =>
  Array.from(p.querySelectorAll(s)) as T[];

/* -------------------------------------------------- Starfield */
const canvas = $<HTMLCanvasElement>("#starfield");
if (canvas) {
  try {
    new Starfield(canvas, { reduceMotion });
  } catch (err) {
    console.warn("Starfield failed to init", err);
    canvas.style.display = "none";
  }
}

/* -------------------------------------------------- Smooth scroll */
let lenis: Lenis | null = null;
if (!reduceMotion) {
  lenis = new Lenis({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.6 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollTo(target: string) {
  const el = $(target);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: 0 });
  else el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
}

$$("[data-scroll-to]").forEach((btn) => {
  btn.addEventListener("click", () => scrollTo(btn.dataset.scrollTo!));
});
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const href = (a as HTMLAnchorElement).getAttribute("href")!;
    if (href.length > 1) {
      e.preventDefault();
      scrollTo(href);
      closeMenu();
    }
  });
});

/* -------------------------------------------------- Clock (São Paulo) */
const clockEl = $("#clock");
if (clockEl) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const tick = () => (clockEl.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 1000);
}

/* -------------------------------------------------- Mobile menu */
const header = $("#header");
const menuToggle = $("#menuToggle");
const mobileMenu = $("#mobileMenu");
let menuOpen = false;

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  header?.classList.remove("is-open");
  mobileMenu?.classList.remove("is-open");
  document.body.classList.remove("is-locked");
  lenis?.start();
}
menuToggle?.addEventListener("click", () => {
  menuOpen = !menuOpen;
  header?.classList.toggle("is-open", menuOpen);
  mobileMenu?.classList.toggle("is-open", menuOpen);
  document.body.classList.toggle("is-locked", menuOpen);
  if (menuOpen) lenis?.stop();
  else lenis?.start();
});

/* -------------------------------------------------- Custom cursor */
if (finePointer && !reduceMotion) {
  const cursor = $("#cursor")!;
  const dot = $(".cursor__dot", cursor)!;
  const ring = $(".cursor__ring", cursor)!;
  let mx = window.innerWidth / 2,
    my = window.innerHeight / 2;
  let rx = mx,
    ry = my;

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = `${mx}px`;
    dot.style.top = `${my}px`;
  });

  const loop = () => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.left = `${rx}px`;
    ring.style.top = `${ry}px`;
    requestAnimationFrame(loop);
  };
  loop();

  $$("[data-cursor]").forEach((el) => {
    const kind = el.dataset.cursor;
    el.addEventListener("pointerenter", () =>
      cursor.classList.add(kind === "view" ? "is-view" : "is-hover")
    );
    el.addEventListener("pointerleave", () =>
      cursor.classList.remove("is-view", "is-hover")
    );
  });
}

/* -------------------------------------------------- Marquee */
const marqueeTrack = $("#marqueeTrack");
if (marqueeTrack && !reduceMotion) {
  const tween = gsap.to(marqueeTrack, {
    xPercent: -50,
    duration: 30,
    ease: "none",
    repeat: -1,
  });
  // Speed up briefly with scroll velocity for a lively, editorial feel.
  const speed = { val: 1 };
  ScrollTrigger.create({
    onUpdate: (self) => {
      const v = Math.min(Math.abs(self.getVelocity()) / 250, 6);
      gsap.to(speed, {
        val: 1 + v,
        duration: 0.3,
        overwrite: true,
        onUpdate: () => tween.timeScale(speed.val),
        onComplete: () => {
          gsap.to(speed, { val: 1, duration: 0.8, onUpdate: () => tween.timeScale(speed.val) });
        },
      });
    },
  });
}

/* -------------------------------------------------- Reveals */
function setupReveals() {
  const heroReveals = $$(".hero .reveal");
  const otherReveals = $$(".reveal").filter((el) => !el.closest(".hero"));

  if (reduceMotion) {
    gsap.set([...$$(".reveal"), ...$$(".hero__word"), ...$$(".reveal-line > *")], {
      clearProps: "all",
    });
    return { heroReveals };
  }

  // Own the word transform via GSAP so yPercent animates cleanly
  // (a CSS translateY(110%) would otherwise be read as a pixel `y`).
  gsap.set($$(".hero__word"), { yPercent: 110, y: 0 });
  gsap.set(otherReveals, { opacity: 0, y: 28 });
  ScrollTrigger.batch(otherReveals, {
    start: "top 88%",
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power3.out",
        stagger: 0.09,
        overwrite: true,
      }),
  });

  // Contact headline lines.
  $$(".reveal-line").forEach((line) => {
    const inner = line.firstElementChild as HTMLElement;
    if (!inner) return;
    gsap.set(inner, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: line,
      start: "top 90%",
      onEnter: () =>
        gsap.to(inner, { yPercent: 0, duration: 1.2, ease: "power4.out" }),
    });
  });

  return { heroReveals };
}

/* -------------------------------------------------- Intro / preloader */
function intro(heroReveals: HTMLElement[]) {
  const words = $$(".hero__word");

  if (reduceMotion) {
    gsap.set([...words, ...heroReveals], { clearProps: "all" });
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
  tl.to(words, {
    yPercent: 0,
    duration: 1.3,
    stagger: 0.12,
  })
    .to(
      heroReveals,
      { opacity: 1, y: 0, duration: 1, stagger: 0.08 },
      "-=0.9"
    );
}

function runPreloader(onDone: () => void) {
  const pre = $("#preloader");
  const count = $("#preloaderCount");
  const fill = $("#preloaderFill");

  if (!pre || reduceMotion) {
    pre?.remove();
    onDone();
    return;
  }

  const counter = { v: 0 };
  const tl = gsap.timeline();
  tl.to(counter, {
    v: 100,
    duration: 1.6,
    ease: "power2.inOut",
    onUpdate: () => {
      const val = Math.round(counter.v);
      if (count) count.textContent = String(val).padStart(2, "0");
      if (fill) fill.style.width = `${val}%`;
    },
  })
    .to(pre, { yPercent: -100, duration: 1, ease: "power4.inOut" }, "+=0.15")
    .add(() => {
      pre.remove();
      onDone();
    }, "-=0.4");
}

/* -------------------------------------------------- Boot */
const { heroReveals } = setupReveals();

const boot = () => {
  runPreloader(() => {
    intro(heroReveals);
    ScrollTrigger.refresh();
  });
};

if (document.readyState === "complete") boot();
else window.addEventListener("load", boot);

// Failsafe: never leave the preloader stuck if something stalls.
setTimeout(() => {
  const pre = $("#preloader");
  if (pre && pre.isConnected) {
    pre.remove();
    intro(heroReveals);
  }
}, 6000);
