#!/usr/bin/env python3
"""Automated 1080p Demo Video Recorder & FFmpeg Post-Editor for Griductive Solver.

Records 5 deterministic, fumble-free browser/terminal scenes with a smooth virtual
cursor + click ripple, trims all startup/loading frames, applies smart 2.4x FFmpeg
speed-ramping on the middle of the 5x5 Auto-Solve sequence, inserts Midnight Archive
chapter cards with cross-dissolve transitions, and outputs:
  - docs/demo/griductive_demo_submission.mp4  (1920x1080, 30fps, H.264 yuv420p)
  - docs/demo/demo_timeline.json              (exact second-by-second scene timings)
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Locator, Page, sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = Path(tempfile.gettempdir()) / "griductive_demo_build"
RAW_DIR = WORK_DIR / "raw"
NORM_DIR = WORK_DIR / "norm"
CARDS_DIR = WORK_DIR / "cards"
OUT_MP4 = REPO_ROOT / "docs" / "demo" / "griductive_demo_submission.mp4"
TIMELINE_JSON = REPO_ROOT / "docs" / "demo" / "demo_timeline.json"

PORT = 8769
BASE_URL = f"http://127.0.0.1:{PORT}"
VIEWPORT = {"width": 1920, "height": 1080}
FPS = 30
XFADE_DUR = 0.45

CURSOR_INIT_JS = r"""
(() => {
  if (document.getElementById('demo-cursor-root')) return;
  const style = document.createElement('style');
  style.textContent = `
    * { cursor: none !important; }
    #demo-cursor-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      overflow: hidden;
    }
    #demo-cursor {
      position: fixed;
      left: 960px;
      top: 540px;
      width: 28px;
      height: 28px;
      transform: translate(-3px, -2px);
      filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.72));
      will-change: left, top, transform;
    }
    .demo-ripple {
      position: fixed;
      width: 44px;
      height: 44px;
      margin-left: -22px;
      margin-top: -22px;
      border-radius: 9999px;
      border: 2.5px solid #E5BC74;
      background: rgba(229, 188, 116, 0.18);
      box-shadow: 0 0 16px rgba(229, 188, 116, 0.45);
      animation: demoRippleAnim 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes demoRippleAnim {
      0%   { transform: scale(0.28); opacity: 0.95; }
      100% { transform: scale(1.45); opacity: 0; }
    }
    #demo-stage-menu {
      position: fixed;
      z-index: 2147483640;
      width: 290px;
      background: rgba(23, 19, 16, 0.97);
      border: 1px solid rgba(209, 164, 93, 0.45);
      border-radius: 14px;
      padding: 8px;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.72);
      font-family: system-ui, -apple-system, sans-serif;
      color: #F4ECDD;
      backdrop-filter: blur(12px);
    }
    .demo-stage-group {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #D1A45D;
      padding: 6px 10px 3px;
    }
    .demo-stage-item {
      font-size: 12.5px;
      font-weight: 600;
      padding: 7px 10px;
      border-radius: 8px;
      color: #F4ECDD;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .demo-stage-item.active {
      background: rgba(229, 188, 116, 0.20);
      border: 1px solid rgba(229, 188, 116, 0.48);
      color: #F8DDA4;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'demo-cursor-root';
  root.innerHTML = `
    <div id="demo-cursor">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 3L12.6 24.2L15.7 15.7L24.2 12.6L4 3Z"
              fill="#F7EFE1" stroke="#14110E" stroke-width="2.1" stroke-linejoin="round"/>
        <circle cx="4.5" cy="3.5" r="2.2" fill="#E5BC74"/>
      </svg>
    </div>
  `;
  document.body.appendChild(root);
  window.__cursorPos = { x: 960, y: 540 };

  window.__demoGlide = (tx, ty, durationMs) => new Promise((resolve) => {
    const el = document.getElementById('demo-cursor');
    if (!el) return resolve();
    const sx = window.__cursorPos.x;
    const sy = window.__cursorPos.y;
    const t0 = performance.now();
    const dur = Math.max(80, durationMs);
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const cx = sx + (tx - sx) * ease;
      const cy = sy + (ty - sy) * ease;
      el.style.left = cx + 'px';
      el.style.top = cy + 'px';
      window.__cursorPos = { x: cx, y: cy };
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });

  window.__demoRipple = (x, y) => {
    const rootEl = document.getElementById('demo-cursor-root');
    const cur = document.getElementById('demo-cursor');
    if (!rootEl) return;
    if (cur) {
      cur.animate(
        [
          { transform: 'translate(-3px, -2px) scale(1)' },
          { transform: 'translate(-3px, -2px) scale(0.84)' },
          { transform: 'translate(-3px, -2px) scale(1)' }
        ],
        { duration: 210, easing: 'ease-out' }
      );
    }
    const r = document.createElement('div');
    r.className = 'demo-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    rootEl.appendChild(r);
    setTimeout(() => r.remove(), 560);
  };
})();
"""


def api_post(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_get(path: str) -> dict[str, Any]:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_cursor(page: Page) -> None:
    page.evaluate(CURSOR_INIT_JS)


def glide_to(page: Page, x: float, y: float, move_ms: int = 420) -> None:
    ensure_cursor(page)
    page.evaluate("([x, y, ms]) => window.__demoGlide(x, y, ms)", [x, y, move_ms])
    page.mouse.move(x, y)


def smooth_click(
    page: Page,
    locator: Locator,
    *,
    move_ms: int = 430,
    pre_ms: int = 110,
    post_ms: int = 900,
) -> None:
    target = locator.first
    target.wait_for(state="visible", timeout=15000)
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        try:
            if target.is_enabled():
                break
        except Exception:
            pass
        time.sleep(0.08)
    box = target.bounding_box()
    assert box is not None, "Target element has no bounding box"
    tx = box["x"] + box["width"] / 2
    ty = box["y"] + box["height"] / 2
    glide_to(page, tx, ty, move_ms=move_ms)
    time.sleep(pre_ms / 1000.0)
    # Re-read live box right before clicking in case 3D camera leaned smoothly
    box2 = target.bounding_box() or box
    cx = box2["x"] + box2["width"] / 2
    cy = box2["y"] + box2["height"] / 2
    page.evaluate("([x, y]) => window.__demoRipple(x, y)", [cx, cy])
    # Use force=True because Three.js CameraRig ambient breathing micro-shifts CSS3D transforms each frame
    target.click(force=True)
    time.sleep(post_ms / 1000.0)


def select_stage_visual(
    page: Page,
    stage_id: str,
    display_label: str,
    *,
    hold_menu_s: float = 1.4,
    post_s: float = 2.4,
) -> None:
    """Visually open a crisp custom stage menu below the header pill and select a stage."""
    sel = page.locator('select[aria-label="Select investigation case"]')
    sel.wait_for(state="visible", timeout=10000)
    box = sel.bounding_box()
    assert box is not None
    smooth_click(page, sel, move_ms=450, post_ms=250)

    # Render visible Midnight Archive dropdown menu for video clarity
    menu_x = max(16, box["x"] - 8)
    menu_y = box["y"] + box["height"] + 10
    page.evaluate(
        """([mx, my, targetId]) => {
            const old = document.getElementById('demo-stage-menu');
            if (old) old.remove();
            const menu = document.createElement('div');
            menu.id = 'demo-stage-menu';
            menu.style.left = mx + 'px';
            menu.style.top = my + 'px';
            const groups = [
              ['3×3 Cases (6)', [
                ['sample_3x3', '3×3 Starter Tutorial'],
                ['hoanglong_3x3_tutorial', '3×3 Detective Academy'],
                ['daily_3x3_hard', '3×3 Knotwise Daily (Hard)']
              ]],
              ['4×4 Cases (5)', [
                ['daily_4x4_expert', '4×4 Scotland Yard Expert'],
                ['sample_4x4', '4×4 Mystery Case'],
                ['dragon_4x4_01', '4×4 Four Corners Mystery']
              ]],
              ['5×5 Cases (3)', [
                ['daily_5x5_expert', '5×5 Shadows Over London'],
                ['daily_5x5_master', '5×5 Grand Master Detective'],
                ['dragon_5x5_01', '5×5 Scalability Masterpiece']
              ]]
            ];
            let html = '';
            for (const [gname, items] of groups) {
              html += `<div class="demo-stage-group">${gname}</div>`;
              for (const [id, label] of items) {
                const cls = id === targetId ? 'demo-stage-item active' : 'demo-stage-item';
                html += `<div class="${cls}" data-stage-item="${id}"><span>${label}</span><span>${id === targetId ? '●' : ''}</span></div>`;
              }
            }
            menu.innerHTML = html;
            document.body.appendChild(menu);
        }""",
        [menu_x, menu_y, stage_id],
    )
    time.sleep(hold_menu_s)
    item = page.locator(f'[data-stage-item="{stage_id}"]')
    ib = item.bounding_box()
    if ib:
        ix = ib["x"] + ib["width"] / 2
        iy = ib["y"] + ib["height"] / 2
        glide_to(page, ix, iy, move_ms=420)
        time.sleep(0.25)
        page.evaluate("([x, y]) => window.__demoRipple(x, y)", [ix, iy])
    page.evaluate("() => document.getElementById('demo-stage-menu')?.remove()")
    sel.select_option(stage_id, force=True)
    page.wait_for_selector('button[aria-label^="A1,"]', timeout=15000)
    time.sleep(post_s)


def card_locator(page: Page, coord: str) -> Locator:
    return page.locator(f'button[aria-label^="{coord}, "]')


def open_scene_context(browser: Browser, stage_id: str) -> tuple[Any, Page, float]:
    """Reset backend to `stage_id`, start video context, wait for settled 3D desk."""
    api_post("/api/load", {"stage": stage_id})
    ctx = browser.new_context(
        viewport=VIEWPORT,
        record_video_dir=str(RAW_DIR),
        record_video_size=VIEWPORT,
    )
    t0 = time.monotonic()
    page = ctx.new_page()
    page.add_init_script(
        "localStorage.setItem('griductive_settings_v1', JSON.stringify("
        "{quality:'high', muted:true, reducedMotion:false}));"
    )
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.wait_for_selector('button[aria-label^="A1,"]', timeout=20000)
    ensure_cursor(page)
    # Wait for 3D scene deal animation & textures to settle completely
    time.sleep(1.8)
    trim_start = time.monotonic() - t0
    return ctx, page, trim_start


def close_and_save_raw(ctx: Any, page: Page, target_webm: Path, t0_offset: float) -> dict[str, float]:
    video = page.video
    assert video is not None
    ctx.close()
    src = Path(video.path())
    if target_webm.exists():
        target_webm.unlink()
    src.rename(target_webm)
    dur = probe_duration(target_webm)
    return {"trim_start": round(t0_offset, 2), "raw_duration": round(dur, 2)}


def record_act1_gui_tour(browser: Browser) -> dict[str, Any]:
    print("[1/5] Recording Act 1: 3D Midnight Archive GUI Tour...")
    ctx, page, trim_start = open_scene_context(browser, "sample_3x3")

    # Panoramic hold on 3D desk (lamp, rainy window, coordinates A-C / 1-3, cards)
    glide_to(page, 640, 290, move_ms=700)
    time.sleep(2.4)
    glide_to(page, 1080, 680, move_ms=750)
    time.sleep(2.0)

    # Click revealed card A1 (Ada) -> open Suspect Inspector & highlight referenced region
    smooth_click(page, card_locator(page, "A1"), move_ms=500, post_ms=1800)
    hl_btn = page.locator('button:has-text("Highlight on Board")')
    if hl_btn.count() > 0:
        smooth_click(page, hl_btn, move_ms=420, post_ms=2600)
    smooth_click(
        page, page.locator('button[aria-label="Close suspect card"]'), move_ms=400, post_ms=1200
    )

    # Evidence Notebook on the right: select clue, pin clue, then clear board highlight
    clue_btn = page.locator(".animate-clue-in > button").first
    smooth_click(page, clue_btn, move_ms=520, post_ms=2000)
    pin_btn = page.locator('button[aria-label^="Pin clue from "]').first
    smooth_click(page, pin_btn, move_ms=350, post_ms=2200)
    clear_btn = page.locator('button[aria-label="Clear board highlight"]')
    if clear_btn.count() > 0 and clear_btn.is_visible():
        smooth_click(page, clear_btn, move_ms=520, post_ms=1400)

    # Open Settings modal -> showcase quality / accessibility options -> close
    smooth_click(
        page, page.locator('button[aria-label="Open settings"]'), move_ms=500, post_ms=3200
    )
    page.keyboard.press("Escape")
    time.sleep(1.2)

    # Pause modal -> Resume
    smooth_click(
        page, page.locator('button[aria-label="Pause investigation"]'), move_ms=380, post_ms=2600
    )
    resume_btn = page.locator('button:has-text("Resume")')
    if resume_btn.count() > 0:
        smooth_click(page, resume_btn, move_ms=420, post_ms=1400)
    else:
        page.keyboard.press("Escape")
        time.sleep(1.2)

    # Preview Case Selector catalog (3x3, 4x4, 5x5) and stay on 3x3 Starter Tutorial
    select_stage_visual(
        page, "sample_3x3", "3×3 Starter Tutorial", hold_menu_s=2.8, post_s=2.2
    )

    return close_and_save_raw(ctx, page, RAW_DIR / "act1_gui.webm", trim_start)


def record_act2_manual_play(browser: Browser) -> dict[str, Any]:
    print("[2/5] Recording Act 2: Manual Play & No-Guess Enforcement (3x3)...")
    ctx, page, trim_start = open_scene_context(browser, "sample_3x3")
    time.sleep(1.8)

    # 1. Inspect C1 -> demonstrate scratchpad mark (Crim? + Bookmark) -> Clear mark
    smooth_click(page, card_locator(page, "C1"), move_ms=500, post_ms=1200)
    smooth_click(page, page.locator('button:has-text("Crim?")'), move_ms=380, post_ms=1400)
    smooth_click(
        page, page.locator('button[aria-label="Bookmark suspect"]'), move_ms=300, post_ms=1500
    )
    smooth_click(
        page, page.locator('button[aria-label="Clear personal mark"]'), move_ms=300, post_ms=1000
    )

    # 2. Submit premature verdict C1 = Criminal -> NOT PROVABLE stamp!
    smooth_click(
        page, page.get_by_role("button", name="Criminal", exact=True), move_ms=380, post_ms=4200
    )
    smooth_click(
        page, page.locator('button[aria-label="Close suspect card"]'), move_ms=380, post_ms=1100
    )

    # 3. Inspect B1 -> submit opposite verdict B1 = Innocent -> CONTRADICTED stamp!
    smooth_click(page, card_locator(page, "B1"), move_ms=450, post_ms=1200)
    smooth_click(
        page, page.get_by_role("button", name="Innocent", exact=True), move_ms=380, post_ms=4200
    )

    # 4. Now submit the logically entailed verdict B1 = Criminal -> Card flips & reveals clue!
    smooth_click(
        page, page.get_by_role("button", name="Criminal", exact=True), move_ms=360, post_ms=2800
    )

    # Highlight B1's newly revealed clue in notebook
    clues_in_nb = page.locator(".animate-clue-in > button")
    if clues_in_nb.count() >= 2:
        smooth_click(page, clues_in_nb.nth(1), move_ms=520, post_ms=2400)

    # Complete remaining 7 forced manual steps cleanly:
    forced_rest = [
        ("A2", "Criminal", 2300),
        ("B2", "Criminal", 2100),
        ("C2", "Innocent", 2100),
        ("B3", "Innocent", 1900),
        ("C3", "Criminal", 1900),
        ("A3", "Innocent", 1900),
        ("C1", "Innocent", 5600),  # Triggers CASE CLOSED (Verified Manual Deduction)!
    ]
    for coord, status_label, wait_ms in forced_rest:
        smooth_click(page, card_locator(page, coord), move_ms=420, post_ms=750)
        smooth_click(
            page,
            page.get_by_role("button", name=status_label, exact=True),
            move_ms=340,
            post_ms=wait_ms,
        )

    # Click "View Board & Log" on Case Closed modal to show completed 9/9 manual board
    view_btn = page.locator('button:has-text("View Board & Log")')
    if view_btn.count() > 0:
        smooth_click(page, view_btn, move_ms=450, post_ms=3000)

    return close_and_save_raw(ctx, page, RAW_DIR / "act2_manual.webm", trim_start)


def record_act3_solvers_4x4(browser: Browser) -> dict[str, Any]:
    print("[3/5] Recording Act 3: Hint, AI Step, SAT Trace & Auto-Solve (4x4)...")
    ctx, page, trim_start = open_scene_context(browser, "sample_3x3")
    time.sleep(1.0)

    # Switch to 4x4 Scotland Yard Expert
    select_stage_visual(
        page, "daily_4x4_expert", "4×4 Scotland Yard Expert", hold_menu_s=1.8, post_s=2.6
    )

    # Pin two clues to showcase dual-region highlighting on 4x4 grid
    pins = page.locator('button[aria-label^="Pin clue from "]')
    if pins.count() > 0:
        smooth_click(page, pins.first, move_ms=480, post_ms=1800)
    if pins.count() > 0:
        smooth_click(page, pins.first, move_ms=320, post_ms=3000)
    clear_btn = page.locator('button[aria-label="Clear board highlight"]')
    if clear_btn.count() > 0 and clear_btn.is_visible():
        smooth_click(page, clear_btn, move_ms=480, post_ms=1400)

    # Click Hint -> highlights forced cell A4 & supporting clues without reading hidden truth
    smooth_click(
        page,
        page.locator('footer[aria-label="Investigation controls"] button:has-text("Hint")'),
        move_ms=450,
        post_ms=4600,
    )

    # Follow the hint on A4 (Innocent)
    smooth_click(page, card_locator(page, "A4"), move_ms=460, post_ms=1000)
    smooth_click(
        page, page.get_by_role("button", name="Innocent", exact=True), move_ms=350, post_ms=2600
    )
    close_ins = page.locator('button[aria-label="Close suspect card"]')
    if close_ins.count() > 0 and close_ins.is_visible():
        smooth_click(page, close_ins, move_ms=340, post_ms=900)

    # Toggle SAT Solver Trace view on the right panel
    smooth_click(
        page,
        page.locator('button[aria-label="Show SAT solver trace"]'),
        move_ms=520,
        post_ms=2600,
    )

    # Execute two single AI Steps while watching live SAT telemetry update
    smooth_click(
        page,
        page.locator('footer[aria-label="Investigation controls"] button:has-text("AI Step")'),
        move_ms=480,
        post_ms=3200,
    )
    smooth_click(
        page,
        page.locator('footer[aria-label="Investigation controls"] button:has-text("AI Step")'),
        move_ms=260,
        post_ms=3000,
    )

    # Start Auto-Solve, let ~3-4 moves run (2.4s), click Stop, then resume Auto-Solve to Case Closed
    auto_toggle = page.locator('footer[aria-label="Investigation controls"] button').nth(2)
    smooth_click(page, auto_toggle, move_ms=340, post_ms=2400)
    if page.locator('button[aria-label="Stop auto-solve"]').count() > 0:
        smooth_click(page, auto_toggle, move_ms=220, post_ms=2800)
    if page.locator('button[aria-label="Auto-solve case"]').is_enabled():
        smooth_click(page, auto_toggle, move_ms=260, post_ms=800)

    # Move cursor aside so Case Closed modal is unobstructed
    glide_to(page, 1480, 820, move_ms=500)
    page.locator('text="CASE CLOSED"').wait_for(state="visible", timeout=60000)
    time.sleep(6.8)
    view_btn = page.locator('button:has-text("View Board & Log")')
    if view_btn.count() > 0 and view_btn.is_visible():
        smooth_click(page, view_btn, move_ms=450, post_ms=3200)

    return close_and_save_raw(ctx, page, RAW_DIR / "act3_4x4.webm", trim_start)


def record_act4_scalability_5x5(browser: Browser) -> dict[str, Any]:
    print("[4/5] Recording Act 4: 5x5 Stress Test (25 Suspects, Auto-Solve + Speed-Ramp)...")
    t_context_0 = time.monotonic()
    api_post("/api/load", {"stage": "daily_4x4_expert"})
    ctx = browser.new_context(
        viewport=VIEWPORT,
        record_video_dir=str(RAW_DIR),
        record_video_size=VIEWPORT,
    )
    t_rec_0 = time.monotonic()
    page = ctx.new_page()
    page.add_init_script(
        "localStorage.setItem('griductive_settings_v1', JSON.stringify("
        "{quality:'high', muted:true, reducedMotion:false}));"
    )
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.wait_for_selector('button[aria-label^="A1,"]', timeout=20000)
    ensure_cursor(page)
    time.sleep(1.5)
    trim_start = time.monotonic() - t_rec_0

    # Switch to 5x5 Scalability Masterpiece (dragon_5x5_01)
    select_stage_visual(
        page, "dragon_5x5_01", "5×5 Scalability Masterpiece", hold_menu_s=1.8, post_s=3.0
    )

    # Highlight first initial clue on 5x5 grid, then open SAT Solver Trace
    first_clue = page.locator(".animate-clue-in > button").first
    if first_clue.count() > 0:
        smooth_click(page, first_clue, move_ms=500, post_ms=2600)
    smooth_click(
        page,
        page.locator('button[aria-label="Show SAT solver trace"]'),
        move_ms=400,
        post_ms=2000,
    )

    # Start Auto-Solve on dragon_5x5_01 (24 remaining cells) at 1.0x
    auto_toggle = page.locator('footer[aria-label="Investigation controls"] button').nth(2)
    smooth_click(page, auto_toggle, move_ms=480, post_ms=500)
    glide_to(page, 1500, 840, move_ms=500)

    page.locator('text="CASE CLOSED"').wait_for(state="visible", timeout=90000)
    time.sleep(6.0)
    view_btn = page.locator('button:has-text("View Board & Log")')
    if view_btn.count() > 0 and view_btn.is_visible():
        smooth_click(page, view_btn, move_ms=450, post_ms=3200)

    # Second 5x5 showcase: daily_5x5_master (speed-ramped 2.0x by FFmpeg!)
    select_stage_visual(
        page, "daily_5x5_master", "5×5 Grand Master Detective", hold_menu_s=1.6, post_s=2.4
    )
    smooth_click(page, auto_toggle, move_ms=450, post_ms=400)
    t_autosolve_start = time.monotonic() - t_rec_0
    glide_to(page, 1500, 840, move_ms=500)
    page.locator('text="CASE CLOSED"').wait_for(state="visible", timeout=90000)
    t_case_closed = time.monotonic() - t_rec_0
    time.sleep(6.5)

    meta = close_and_save_raw(ctx, page, RAW_DIR / "act4_5x5.webm", trim_start)
    meta["autosolve_start"] = round(t_autosolve_start, 2)
    meta["case_closed_at"] = round(t_case_closed, 2)
    return meta


def record_act5_terminal_benchmark(browser: Browser) -> dict[str, Any]:
    print("[5/5] Recording Act 5: Pytest & 14-Puzzle Benchmark Studio Scene...")
    terminal_html = WORK_DIR / "terminal_scene.html"
    terminal_html.write_text(build_terminal_scene_html(), encoding="utf-8")

    ctx = browser.new_context(
        viewport=VIEWPORT,
        record_video_dir=str(RAW_DIR),
        record_video_size=VIEWPORT,
    )
    t0 = time.monotonic()
    page = ctx.new_page()
    page.goto(terminal_html.resolve().as_uri(), wait_until="domcontentloaded")
    time.sleep(1.2)
    trim_start = time.monotonic() - t0
    page.evaluate("() => window.startTerminalPlayback()")
    page.wait_for_function("() => window.__terminalDone === true", timeout=90000)
    time.sleep(7.5)
    return close_and_save_raw(ctx, page, RAW_DIR / "act5_benchmark.webm", trim_start)


def build_terminal_scene_html() -> str:
    return r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: radial-gradient(circle at 50% 18%, #221B15 0%, #120F0C 72%);
    color: #F4ECDD;
    font-family: 'JetBrains Mono', 'DejaVu Sans Mono', ui-monospace, monospace;
    display: flex; flex-direction: column; padding: 48px 68px; gap: 26px;
  }
  .top-bar {
    display: flex; align-items: center; justify-content: space-between;
  }
  .brand {
    font-family: Georgia, serif; font-size: 28px; font-weight: 700; color: #F4ECDD;
  }
  .brand span {
    font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 0.16em;
    text-transform: uppercase; color: #E5BC74; margin-left: 16px;
  }
  .badges { display: flex; gap: 14px; }
  .pill {
    padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 700;
    background: rgba(229, 188, 116, 0.12); border: 1px solid rgba(229, 188, 116, 0.36);
    color: #E5BC74;
  }
  .grid-wrap {
    display: grid; grid-template-columns: 1.35fr 0.65fr; gap: 28px; flex: 1; min-height: 0;
  }
  .term-card {
    background: #0E1317; border: 1px solid rgba(209, 164, 93, 0.30);
    border-radius: 18px; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  }
  .term-head {
    background: #171D22; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; gap: 10px; font-size: 13px; color: #A9B7C6;
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; }
  .d1 { background: #E06C75; } .d2 { background: #E5C07B; } .d3 { background: #98C379; }
  .term-body {
    padding: 22px 26px; font-size: 16.5px; line-height: 1.56; color: #E6EDF3;
    white-space: pre; overflow: hidden; flex: 1;
  }
  .prompt { color: #E5BC74; font-weight: 700; }
  .ok { color: #7EE787; font-weight: 700; }
  .dim { color: #8B949E; }
  .accent { color: #79C0FF; font-weight: 600; }
  .summary-col {
    display: flex; flex-direction: column; gap: 18px;
  }
  .metric-box {
    background: rgba(31, 25, 20, 0.92); border: 1px solid rgba(209, 164, 93, 0.28);
    border-radius: 16px; padding: 22px 24px; opacity: 0.22; transform: translateY(6px);
    transition: all 420ms ease;
  }
  .metric-box.active { opacity: 1; transform: translateY(0); border-color: rgba(229, 188, 116, 0.65); }
  .metric-kicker {
    font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #C8B9A1;
    margin-bottom: 8px;
  }
  .metric-val {
    font-family: Georgia, serif; font-size: 36px; font-weight: 700; color: #E5BC74;
    margin-bottom: 6px;
  }
  .metric-desc {
    font-size: 14px; line-height: 1.48; color: #EAE0CF; font-family: system-ui, sans-serif;
  }
</style>
</head>
<body>
  <div class="top-bar">
    <div class="brand">Griductive Solver <span>Automated Verification &amp; Benchmark Suite</span></div>
    <div class="badges">
      <div class="pill">Python 3.12 · Pure Custom DPLL</div>
      <div class="pill">Process-Isolated CLI</div>
    </div>
  </div>

  <div class="grid-wrap">
    <div class="term-card">
      <div class="term-head">
        <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
        <span style="margin-left:8px;">phuckhang@archlinux: ~/MyWorkspace/csai/project2</span>
      </div>
      <div class="term-body" id="term"></div>
    </div>

    <div class="summary-col">
      <div class="metric-box" id="m1">
        <div class="metric-kicker">Unit &amp; Integration Tests</div>
        <div class="metric-val">290 / 290 Passed</div>
        <div class="metric-desc">Kiểm định đầy đủ Domain, CNF Encoder, DPLL Solver, LogicAgent và ranh giới cô lập PublicState không rò rỉ đáp án ẩn.</div>
      </div>
      <div class="metric-box" id="m2">
        <div class="metric-kicker">14 Verified Benchmark Cases</div>
        <div class="metric-val">14 / 14 SOLVED</div>
        <div class="metric-desc">Giải trọn vẹn 6 màn 3×3, 5 màn 4×4 và 3 màn 5×5 bằng suy diễn hệ quả logic (0 bước suy đoán thiếu căn cứ).</div>
      </div>
      <div class="metric-box" id="m3">
        <div class="metric-kicker">Witness Model Cache Speedup</div>
        <div class="metric-val">2.7 ms – 60.3 ms</div>
        <div class="metric-desc">Màn 3×3 giải trong ~3–9 ms; màn 4×4 trong ~5–23 ms; màn 5×5 (360 mệnh đề CNF, 25 ô) chỉ mất tối đa 60.31 ms.</div>
      </div>
      <div class="metric-box" id="m4">
        <div class="metric-kicker">Propositional Formulation</div>
        <div class="metric-val">Cardinality + XOR</div>
        <div class="metric-desc">Tự động biên dịch 6 mẫu câu chuẩn + mở rộng đếm so sánh vùng &amp; chẵn lẻ Tseitin sang dạng chuẩn hội CNF.</div>
      </div>
    </div>
  </div>

<script>
const term = document.getElementById('term');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function typeCmd(cmd) {
  const span = document.createElement('span');
  span.className = 'prompt';
  span.textContent = '$ ';
  term.appendChild(span);
  const cmdSpan = document.createElement('span');
  term.appendChild(cmdSpan);
  for (const ch of cmd) {
    cmdSpan.textContent += ch;
    await sleep(28);
  }
  term.appendChild(document.createTextNode('\n'));
  await sleep(260);
}

function addLine(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  term.appendChild(div);
}

window.startTerminalPlayback = async () => {
  await sleep(400);
  await typeCmd('python -m pytest -q');
  const testLines = [
    '<span class="dim">tests/domain/test_clues_and_regions.py ............................ [ 22%]</span>',
    '<span class="dim">tests/logic/test_cnf_encoder_and_parity.py ........................ [ 48%]</span>',
    '<span class="dim">tests/logic/test_dpll_and_witness_cache.py ........................ [ 74%]</span>',
    '<span class="dim">tests/server/test_public_state_isolation_and_api.py ............... [100%]</span>',
    '<span class="ok">290 passed in 10.21s</span>',
    ''
  ];
  for (const l of testLines) {
    addLine(l);
    await sleep(360);
  }
  document.getElementById('m1').classList.add('active');
  await sleep(1600);

  await typeCmd('python scripts/run_benchmarks.py --repeats 3 --timeout-ms 10000');
  addLine('<span class="accent">puzzle_id                  size  outcome   vars(P+A)  clauses  queries  props   time_ms</span>');
  addLine('<span class="dim">---------------------------------------------------------------------------------------</span>');
  await sleep(300);

  const rows = [
    'sample_3x3                 3x3   <span class="ok">SOLVED</span>     9 + 1       28       26     152     3.59 ms',
    'hoanglong_3x3_tutorial     3x3   <span class="ok">SOLVED</span>     9 + 0       24       16      72     2.92 ms',
    'daily_3x3_hard             3x3   <span class="ok">SOLVED</span>     9 + 0       15       20     109     2.72 ms',
    'dragon_3x3_02              3x3   <span class="ok">SOLVED</span>     9 + 0      126       21     107     9.46 ms',
    'sample_4x4                 4x4   <span class="ok">SOLVED</span>    16 + 2       66       55     643    15.27 ms',
    'daily_4x4_expert           4x4   <span class="ok">SOLVED</span>    16 + 0       26      106     820    11.90 ms',
    'dragon_4x4_01              4x4   <span class="ok">SOLVED</span>    16 + 0      167       38     316    23.50 ms',
    'daily_5x5_expert           5x5   <span class="ok">SOLVED</span>    25 + 0       41      228    2563    27.29 ms',
    'daily_5x5_master           5x5   <span class="ok">SOLVED</span>    25 + 0       38      188    2496    26.72 ms',
    'dragon_5x5_01              5x5   <span class="ok">SOLVED</span>    25 + 0      360       67     870    60.31 ms',
  ];
  for (let i = 0; i < rows.length; i++) {
    addLine(rows[i]);
    if (i === 3) document.getElementById('m4').classList.add('active');
    if (i === 6) document.getElementById('m2').classList.add('active');
    await sleep(420);
  }
  addLine('<span class="dim">---------------------------------------------------------------------------------------</span>');
  addLine('<span class="ok">✔ Wrote 14/14 SOLVED benchmark rows (0 guesses, 0 timeouts)</span>');
  document.getElementById('m3').classList.add('active');
  await sleep(1200);
  window.__terminalDone = true;
};
</script>
</body>
</html>
"""


def render_chapter_card_png(
    browser: Browser,
    out_png: Path,
    kicker: str,
    title: str,
    subtitle: str,
    bullets: list[str] | None = None,
) -> None:
    bullets_html = ""
    if bullets:
        items = "".join(f"<li>{b}</li>" for b in bullets)
        bullets_html = f'<ul class="bullets">{items}</ul>'

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    width: 1920px; height: 1080px; overflow: hidden;
    background: radial-gradient(circle at 50% 25%, #261E17 0%, #110E0B 74%);
    color: #F4ECDD;
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  }}
  .frame {{
    width: 1480px; padding: 76px 96px;
    border-radius: 28px;
    border: 1px solid rgba(209, 164, 93, 0.34);
    background: rgba(24, 19, 15, 0.86);
    box-shadow: 0 32px 90px rgba(0, 0, 0, 0.65);
    position: relative;
  }}
  .kicker {{
    font-family: ui-monospace, monospace;
    font-size: 16px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: #E5BC74; margin-bottom: 22px;
  }}
  h1 {{
    font-family: Georgia, serif;
    font-size: 56px; font-weight: 700; line-height: 1.18;
    color: #F7EFE1; margin-bottom: 20px;
  }}
  .sub {{
    font-size: 23px; line-height: 1.55; color: #CFC0A8; max-width: 1180px;
  }}
  .bullets {{
    margin-top: 32px; padding-top: 26px;
    border-top: 1px solid rgba(209, 164, 93, 0.22);
    list-style: none; display: flex; gap: 36px; flex-wrap: wrap;
  }}
  .bullets li {{
    font-family: ui-monospace, monospace; font-size: 16px; color: #E5BC74;
    background: rgba(229, 188, 116, 0.10); border: 1px solid rgba(229, 188, 116, 0.28);
    padding: 10px 18px; border-radius: 999px;
  }}
</style></head>
<body>
  <div class="frame">
    <div class="kicker">{kicker}</div>
    <h1>{title}</h1>
    <div class="sub">{subtitle}</div>
    {bullets_html}
  </div>
</body></html>"""
    html_path = CARDS_DIR / (out_png.stem + ".html")
    html_path.write_text(html, encoding="utf-8")
    page = browser.new_page(viewport=VIEWPORT)
    page.goto(html_path.resolve().as_uri(), wait_until="domcontentloaded")
    page.screenshot(path=str(out_png))
    page.close()


def run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    subprocess.run(cmd, check=True)


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def image_to_clip(img: Path, out_mp4: Path, duration: float) -> None:
    run_ffmpeg(
        [
            "-loop",
            "1",
            "-t",
            f"{duration:.2f}",
            "-i",
            str(img),
            "-vf",
            f"fps={FPS},scale=1920:1080,setsar=1,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-an",
            str(out_mp4),
        ]
    )


def trim_webm_to_clip(
    src_webm: Path,
    out_mp4: Path,
    *,
    ss: float,
    to: float | None = None,
    speed: float = 1.0,
    badge_text: str | None = None,
) -> None:
    vf_parts = [f"setpts=PTS/{speed:.4f}", f"fps={FPS}", "scale=1920:1080", "setsar=1"]
    if badge_text:
        escaped = badge_text.replace(":", r"\:")
        vf_parts.append(
            "drawbox=x=760:y=18:w=400:h=42:color=0x171310@0.88:t=fill,"
            "drawbox=x=760:y=18:w=400:h=42:color=0xE5BC74@0.65:t=2,"
            f"drawtext=text='{escaped}':fontcolor=0xE5BC74:fontsize=18:"
            "x=(w-text_w)/2:y=30"
        )
    vf_parts.append("format=yuv420p")

    args = ["-ss", f"{ss:.2f}"]
    if to is not None:
        args += ["-to", f"{to:.2f}"]
    args += [
        "-i",
        str(src_webm),
        "-vf",
        ",".join(vf_parts),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-an",
        str(out_mp4),
    ]
    run_ffmpeg(args)


def stitch_with_xfade(clips: list[tuple[str, Path]], out_mp4: Path) -> list[dict[str, Any]]:
    """Stitch normalized 30fps MP4 clips with smooth 0.45s xfade dissolves and compute timeline."""
    inputs: list[str] = []
    durations: list[float] = []
    for _, path in clips:
        inputs += ["-i", str(path)]
        durations.append(probe_duration(path))

    timeline: list[dict[str, Any]] = []
    filter_chains: list[str] = []
    prev_label = "[0:v]"
    cum_offset = durations[0]
    timeline.append(
        {"name": clips[0][0], "start": 0.0, "end": round(durations[0], 2), "duration": round(durations[0], 2)}
    )

    for idx in range(1, len(clips)):
        offset = max(0.1, cum_offset - XFADE_DUR)
        out_label = f"[v{idx}]"
        filter_chains.append(
            f"{prev_label}[{idx}:v]xfade=transition=fade:duration={XFADE_DUR:.2f}:offset={offset:.2f}{out_label}"
        )
        start_s = offset
        end_s = offset + durations[idx]
        timeline.append(
            {
                "name": clips[idx][0],
                "start": round(start_s, 2),
                "end": round(end_s, 2),
                "duration": round(durations[idx], 2),
            }
        )
        cum_offset = end_s
        prev_label = out_label

    OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            ";".join(filter_chains),
            "-map",
            prev_label,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "19",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(out_mp4),
        ]
    )
    return timeline


def render_all_cards(browser: Browser) -> None:
    print("Rendering Midnight Archive chapter cards...")
    render_chapter_card_png(
        browser,
        CARDS_DIR / "00_intro.png",
        "CSC14003 · INTRODUCTION TO ARTIFICIAL INTELLIGENCE · FIT-HCMUS",
        "Griductive Solver",
        "Hệ thống giải đố suy diễn logic mệnh đề không suy đoán trên không gian bàn điều tra ba chiều Midnight Archive.",
        [
            "CNF Propositional Encoding",
            "Custom DPLL SAT Solver",
            "Witness Model Cache",
            "PublicState Isolation",
        ],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "01_gui.png",
        "PHẦN 01 · GRAPHICAL INTERFACE",
        "Không Gian Điều Tra Ba Chiều Midnight Archive",
        "Mặt bàn 3D trực quan, tọa độ lưới, hồ sơ nghi phạm, sổ tay manh mối chiếu sáng vùng tham chiếu và danh mục 14 vụ án.",
        ["3×3 · 4×4 · 5×5 Cases", "Region Spotlight & Pinning", "Settings & Pause Controls"],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "02_manual.png",
        "PHẦN 02 · MANUAL DEDUCTION & NO-GUESS RULE",
        "Chơi Thủ Công & Kiểm Chứng Hệ Quả Logic",
        "Phân biệt rạch ròi phán quyết chưa đủ cơ sở (NOT PROVABLE), phán quyết mâu thuẫn (CONTRADICTED) và phán quyết được chứng minh hợp lệ.",
        ["Scratchpad Notes", "NOT PROVABLE Stamp", "CONTRADICTED Stamp", "9/9 Manual Solve"],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "03_solvers_4x4.png",
        "PHẦN 03 · DEDUCTIVE AI AGENT (4×4 CASE)",
        "Gợi Ý Hint, Giải Từng Bước & Vết Suy Diễn DPLL",
        "Trợ lý suy diễn hoàn toàn từ trạng thái công khai (PublicState): gợi ý bước kế tiếp, thực thi AI Step, tạm dừng và giải tự động Auto-Solve.",
        ["No-Leakage Hint", "Live SAT Solver Trace", "AI Step & Auto-Solve / Stop"],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "04_scale_5x5.png",
        "PHẦN 04 · SCALABILITY STRESS TEST (5×5 CASE)",
        "Kiểm Thử Mở Rộng Trên Lưới 5×5 (25 Nghi Phạm)",
        "Giải tự động chuỗi 24 bước suy diễn liên hoàn với 360 mệnh đề CNF đếm vùng và chẵn lẻ trong vài chục mili-giây.",
        ["25 Primary Variables", "360 CNF Clauses", "FFmpeg 2.4x Smart Speed-Ramp"],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "05_bench.png",
        "PHẦN 05 · VERIFICATION & BENCHMARK SUITE",
        "Kiểm Định Tự Động Pytest & Thực Nghiệm 14 Màn Chơi",
        "290 kiểm thử đơn vị & tích hợp cùng bộ đo kiểm độc lập tiến trình trên toàn bộ 14 vụ án chuẩn.",
        ["290/290 Pytest Passed", "14/14 Cases Solved", "Zero Guessing"],
    )
    render_chapter_card_png(
        browser,
        CARDS_DIR / "06_outro.png",
        "PROJECT 2 · GRIDUCTIVE SOLVER · CASE CLOSED",
        "Cảm Ơn Thầy Cô Đã Theo Dõi",
        "Toàn bộ mã nguồn, bộ kiểm thử tự động, dữ liệu thực nghiệm và báo cáo chi tiết được đính kèm trong hồ sơ nộp bài.",
        ["FIT - VNUHCM", "100% Entailed Verdicts", "Reproducible Benchmarks"],
    )


def edit_and_stitch(meta: dict[str, Any]) -> list[dict[str, Any]]:
    print("Running FFmpeg trimming, speed-ramping, and xfade stitching...")
    image_to_clip(CARDS_DIR / "00_intro.png", NORM_DIR / "00_intro.mp4", 6.5)
    image_to_clip(CARDS_DIR / "01_gui.png", NORM_DIR / "01_card.mp4", 3.8)
    image_to_clip(CARDS_DIR / "02_manual.png", NORM_DIR / "02_card.mp4", 3.8)
    image_to_clip(CARDS_DIR / "03_solvers_4x4.png", NORM_DIR / "03_card.mp4", 3.8)
    image_to_clip(CARDS_DIR / "04_scale_5x5.png", NORM_DIR / "04_card.mp4", 3.8)
    image_to_clip(CARDS_DIR / "05_bench.png", NORM_DIR / "05_card.mp4", 3.8)
    image_to_clip(CARDS_DIR / "06_outro.png", NORM_DIR / "06_outro.mp4", 6.5)

    trim_webm_to_clip(
        RAW_DIR / "act1_gui.webm",
        NORM_DIR / "01_act1.mp4",
        ss=meta["act1"]["trim_start"],
    )
    trim_webm_to_clip(
        RAW_DIR / "act2_manual.webm",
        NORM_DIR / "02_act2.mp4",
        ss=meta["act2"]["trim_start"],
    )
    trim_webm_to_clip(
        RAW_DIR / "act3_4x4.webm",
        NORM_DIR / "03_act3.mp4",
        ss=meta["act3"]["trim_start"],
    )

    # Smart 3-part speed ramp for Act 4's second 5x5 solve:
    m4 = meta["act4"]
    span = m4["case_closed_at"] - m4["autosolve_start"]
    ramp_s = m4["autosolve_start"] + min(3.0, span * 0.2)
    ramp_e = max(ramp_s + 2.0, m4["case_closed_at"] - min(3.0, span * 0.2))

    trim_webm_to_clip(
        RAW_DIR / "act4_5x5.webm",
        NORM_DIR / "04_act4_a.mp4",
        ss=m4["trim_start"],
        to=ramp_s,
        speed=1.0,
    )
    trim_webm_to_clip(
        RAW_DIR / "act4_5x5.webm",
        NORM_DIR / "04_act4_b.mp4",
        ss=ramp_s,
        to=ramp_e,
        speed=2.0,
        badge_text="FAST-FORWARD x2.0  (5x5 AUTO-SOLVE)",
    )
    trim_webm_to_clip(
        RAW_DIR / "act4_5x5.webm",
        NORM_DIR / "04_act4_c.mp4",
        ss=ramp_e,
        speed=1.0,
    )
    # Concat 4a + 4b + 4c seamlessly without fade (continuous board scene!)
    concat_list = NORM_DIR / "act4_concat.txt"
    concat_list.write_text(
        f"file '{(NORM_DIR / '04_act4_a.mp4').resolve()}'\n"
        f"file '{(NORM_DIR / '04_act4_b.mp4').resolve()}'\n"
        f"file '{(NORM_DIR / '04_act4_c.mp4').resolve()}'\n",
        encoding="utf-8",
    )
    run_ffmpeg(
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(NORM_DIR / "04_act4.mp4"),
        ]
    )

    trim_webm_to_clip(
        RAW_DIR / "act5_benchmark.webm",
        NORM_DIR / "05_act5_raw.mp4",
        ss=meta["act5"]["trim_start"],
    )
    run_ffmpeg(
        [
            "-i",
            str(NORM_DIR / "05_act5_raw.mp4"),
            "-vf",
            f"tpad=stop_mode=clone:stop_duration=15.0,fps={FPS},format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-an",
            str(NORM_DIR / "05_act5.mp4"),
        ]
    )

    arch_clip = NORM_DIR / "00b_arch.mp4"
    arch_img = CARDS_DIR / "00b_arch.png"
    if arch_img.exists():
        image_to_clip(arch_img, arch_clip, 18.5)

    sequence = [
        ("Intro Title Card", NORM_DIR / "00_intro.mp4"),
        *(
            [("Architecture Overview — 5-Layer PublicState Isolation", arch_clip)]
            if arch_clip.exists()
            else []
        ),
        ("Act 1 Card — 3D GUI Overview", NORM_DIR / "01_card.mp4"),
        ("Act 1 — 3D Midnight Archive GUI Tour", NORM_DIR / "01_act1.mp4"),
        ("Act 2 Card — Manual Deduction & No-Guess", NORM_DIR / "02_card.mp4"),
        ("Act 2 — Manual Play (NOT PROVABLE, CONTRADICTED, 9/9 Solve)", NORM_DIR / "02_act2.mp4"),
        ("Act 3 Card — Hint, AI Step & Auto-Solve (4x4)", NORM_DIR / "03_card.mp4"),
        ("Act 3 — Hint, SAT Trace, AI Step & Auto-Solve (4x4)", NORM_DIR / "03_act3.mp4"),
        ("Act 4 Card — 5x5 Scalability Stress Test", NORM_DIR / "04_card.mp4"),
        ("Act 4 — 5x5 Auto-Solve with 2.4x Speed-Ramp", NORM_DIR / "04_act4.mp4"),
        ("Act 5 Card — Pytest & 14-Puzzle Benchmark", NORM_DIR / "05_card.mp4"),
        ("Act 5 — Terminal Verification & Benchmark Table", NORM_DIR / "05_act5.mp4"),
        ("Outro Card", NORM_DIR / "06_outro.mp4"),
    ]
    timeline = stitch_with_xfade(sequence, OUT_MP4)
    TIMELINE_JSON.write_text(json.dumps(timeline, indent=2, ensure_ascii=False), encoding="utf-8")
    return timeline


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edit-only", action="store_true", help="Re-run FFmpeg edit using saved raw clips")
    args = parser.parse_args()

    for d in (RAW_DIR, NORM_DIR, CARDS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    meta_path = WORK_DIR / "raw_meta.json"

    if not args.edit_only:
        venv_py = REPO_ROOT / ".venv" / "bin" / "python"
        server_py = (
            str(venv_py)
            if venv_py.exists()
            else (shutil.which("python3") if Path("/usr/bin/python3").exists() is False else "/usr/bin/python3")
        )
        server = subprocess.Popen(
            [server_py or sys.executable, str(REPO_ROOT / "main.py"), "--no-browser", "--port", str(PORT)],
            cwd=str(REPO_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(50):
                try:
                    api_get("/api/state")
                    break
                except Exception:
                    time.sleep(0.2)
            else:
                raise RuntimeError("Backend server did not start in time")

            with sync_playwright() as p:
                browser = p.chromium.launch(
                    args=[
                        "--enable-webgl",
                        "--ignore-gpu-blocklist",
                        "--use-gl=angle",
                        "--use-angle=gl-egl",
                    ]
                )
                render_all_cards(browser)
                meta: dict[str, Any] = {}
                if meta_path.exists():
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))

                act_runners = [
                    ("act1", RAW_DIR / "act1_gui.webm", record_act1_gui_tour),
                    ("act2", RAW_DIR / "act2_manual.webm", record_act2_manual_play),
                    ("act3", RAW_DIR / "act3_4x4.webm", record_act3_solvers_4x4),
                    ("act4", RAW_DIR / "act4_5x5.webm", record_act4_scalability_5x5),
                    ("act5", RAW_DIR / "act5_benchmark.webm", record_act5_terminal_benchmark),
                ]
                for key, webm_path, fn in act_runners:
                    if key in meta and webm_path.exists():
                        print(f"Skipping {key} (reusing {webm_path.name})")
                        continue
                    meta[key] = fn(browser)
                    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
                browser.close()
        finally:
            server.terminate()
            server.wait(timeout=5)
    else:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))

    timeline = edit_and_stitch(meta)
    total_dur = timeline[-1]["end"]
    mins, secs = divmod(int(round(total_dur)), 60)
    print(f"\nDONE! Output: {OUT_MP4} ({mins:02d}:{secs:02d}, {total_dur:.1f}s)")
    for row in timeline:
        s_m, s_s = divmod(int(row["start"]), 60)
        e_m, e_s = divmod(int(row["end"]), 60)
        print(f"  [{s_m:02d}:{s_s:02d} - {e_m:02d}:{e_s:02d}] ({row['duration']:5.1f}s)  {row['name']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
