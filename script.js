// ---------------------------
// Deal-like Game — 8 cases, 3 phases, final keep/switch (phase 4).
// Wolfie overlay shown only for dealer offers (phase 1 and 2).
// Dealer offers are chosen only from allowedOfferPrizes and never the highest remaining prize.
// Wolfie image path uses the uploaded file path: /mnt/data/Wolfie Dealer.png
// ---------------------------

// ----- CONFIG -----
const prizeListOrdered = [
  ".01",
  "Sticker",
  "T-shirt",
  "Signed poster",
  "Luigi’s gift card",
  "Women’s basketball tickets",
  "JBL Go 4",
  "Ninja Creami"
];

// The set of prizes the dealer is allowed to offer (by name)
const allowedOfferPrizes = [
  "T-shirt",
  "Signed poster",
  "Luigi’s gift card",
  "Women’s basketball tickets"
];

// Wolfie image (update if you use CodePen assets)
const wolfieImageSrc = "/mnt/data/Wolfie Dealer.png";

// timing
const revealDelay = 700; // ms between reveals for suspense

// ----- STATE -----
let casePrizes = [];      // randomized mapping of caseIndex -> prize string
let playerCaseIndex = null;   // player's personal case index (0..7)
let phase = 0;            // 0 = pick personal case; 1 = pick 3; 2 = pick 2; 3 = pick 1; 4 = keep/switch
let picksNeeded = 0;      // how many picks remain in current phase
let revealedSet = new Set(); // indices that have been opened/revealed
let overlayVisible = false;  // wolfie overlay visible (blocks clicks)
let originalPlayerIndex = null; // store original player index at game start for final reveal rules

// ----- DOM refs -----
const prizeLeftEl = document.getElementById('prizeLeft');
const prizeRightEl = document.getElementById('prizeRight');
const boardEl = document.getElementById('board');
const playerCaseEl = document.getElementById('playerCase');
const titleEl = document.getElementById('title');

const dealerOverlay = document.getElementById('dealerOverlay');
const wolfieImg = document.getElementById('wolfieImg');
const offerText = document.getElementById('offerText');
const dealerButtons = document.getElementById('dealerButtons');
const dealBtn = document.getElementById('dealBtn');
const noDealBtn = document.getElementById('noDealBtn');

const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');

const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');

// set wolfie image src
wolfieImg.src = wolfieImageSrc;

// ----- UTILITIES -----
function shuffle(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// ----- UI BUILD -----
function buildUI(){
  // sidebars (4 left, 4 right)
  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  prizeListOrdered.slice(0,4).forEach((p,i) => {
    const li = document.createElement('li');
    li.id = `prize-${i}`;
    li.textContent = p;
    prizeLeftEl.appendChild(li);
  });
  prizeListOrdered.slice(4).forEach((p,i) => {
    const li = document.createElement('li');
    li.id = `prize-${i+4}`;
    li.textContent = p;
    prizeRightEl.appendChild(li);
  });

  // board cases
  boardEl.innerHTML = '';
  for (let i=0;i<8;i++){
    const c = document.createElement('div');
    c.className = 'case';
    c.dataset.index = i;
    c.textContent = (i+1);
    c.addEventListener('click', () => onCaseClicked(i));
    boardEl.appendChild(c);
  }
}

// ----- GAME INITIALIZATION -----
function initGame(){
  casePrizes = shuffle(prizeListOrdered);
  playerCaseIndex = null;
  originalPlayerIndex = null;
  phase = 0;
  picksNeeded = 0;
  revealedSet.clear();
  overlayVisible = false;
  winText.classList.add('hidden');
  winText.textContent = '';
  keepSwitchArea.classList.add('hidden');
  dealerOverlay.classList.add('hidden');
  dealerButtons.classList.remove('hidden');

  // reset UI elements
  document.querySelectorAll('.case').forEach((el,i) => {
    el.className = 'case';
    el.textContent = i+1;
    el.style.pointerEvents = 'auto';
  });
  prizeListOrdered.forEach((_,i) => {
    const li = document.getElementById('prize-'+i);
    if (li) li.classList.remove('greyed');
  });
  playerCaseEl.textContent = '?';
  titleEl.textContent = 'Choose your personal case';
}

// ----- HANDLERS -----
function onCaseClicked(index){
  if (overlayVisible) return; // block clicks during dealer overlay
  // case already opened or is greyed? if opened, ignore
  if (revealedSet.has(index)) return;

  if (phase === 0){
    // choose personal case
    playerCaseIndex = index;
    originalPlayerIndex = index;
    playerCaseEl.textContent = index+1;
    document.querySelector(`.case[data-index='${index}']`).classList.add('greyed');
    // proceed to phase 1 (player must pick 3 cases)
    phase = 1;
    picksNeeded = 3;
    titleEl.textContent = `Phase 1 — Pick ${picksNeeded} case(s) to open`;
    return;
  }

  if (phase === 1 || phase === 2 || phase === 3){
    // In phases 1-3, player picks non-player, unopened cases
    if (index === playerCaseIndex) return; // cannot pick personal case
    revealCase(index);
    picksNeeded--;
    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
    } else {
      // after finishing picks in current phase
      if (phase === 1 || phase === 2){
        // show dealer overlay and offer
        showDealerOffer();
      } else if (phase === 3){
        // go to final Keep/Switch phase (phase 4) — show keep/switch UI (no wolfie)
        phase = 4;
        showKeepSwitchUI();
      }
    }
  }
}

// reveal a case (immediate)
function revealCase(index){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);
  const prize = casePrizes[index];
  const el = document.querySelector(`.case[data-index='${index}']`);
  el.classList.add('opened');
  el.textContent = prize;
  el.style.pointerEvents = 'none';

  // darken prize in sidebar
  const pIdx = prizeListOrdered.indexOf(prize);
  if (pIdx >= 0){
    const li = document.getElementById('prize-'+pIdx);
    if (li) li.classList.add('greyed');
  }
}

// compute dealer offer per rules:
// - only choose from allowedOfferPrizes that are still available on the board (i.e., not revealed and not player's case)
// - do NOT offer the highest remaining prize
// - pick randomly from the allowed middle set; if none available, fallback to any non-highest remaining prize
function computeDealerOffer(){
  // gather remaining prizes (excluding player's case and revealed)
  const remaining = [];
  for (let i=0;i<8;i++){
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push(casePrizes[i]);
  }

  // determine highest remaining prize by ordering using prizeListOrdered indices (higher index == higher value)
  const remainingWithIdx = remaining.map(p => ({p, idx: prizeListOrdered.indexOf(p)}))
                                   .sort((a,b) => a.idx - b.idx);
  if (remainingWithIdx.length === 0) return "No Offer";

  // find the highest remaining idx
  const highestIdx = Math.max(...remainingWithIdx.map(r => r.idx));

  // filter allowedOfferPrizes that are present in remaining and not the highest
  let candidates = remainingWithIdx.filter(r => allowedOfferPrizes.includes(r.p) && r.idx !== highestIdx);

  // if no candidates from allowed set, fallback: take any remaining that is not highest
  if (candidates.length === 0){
    candidates = remainingWithIdx.filter(r => r.idx !== highestIdx);
  }

  // if still empty (all remaining are just one prize), pick any remaining
  if (candidates.length === 0){
    candidates = remainingWithIdx;
  }

  // pick random candidate
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick ? pick.p : remainingWithIdx[0].p;
}

// show the wolfie overlay and lock board clicks; use offer computed above
function showDealerOffer(){
  overlayVisible = true;
  const offer = computeDealerOffer();
  offerText.textContent = 'OFFER: ' + offer;
  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');

  // block board clicks
  document.querySelectorAll('.case').forEach(c => c.style.pointerEvents = 'none');

  // wire buttons
  dealBtn.onclick = () => {
    // accept the deal: reveal player's case and show DEAL result using the offered prize text
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    revealPlayerCaseForDeal(offer);
  };

  noDealBtn.onclick = () => {
    // hide overlay and move to next phase
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    // advance phase number and set picksNeeded appropriately
    if (phase === 1){
      phase = 2; picksNeeded = 2;
      titleEl.textContent = `Phase 2 — Pick ${picksNeeded} case(s) to open`;
    } else if (phase === 2){
      phase = 3; picksNeeded = 1;
      titleEl.textContent = `Phase 3 — Pick ${picksNeeded} case(s) to open`;
    }
    // allow clicks on remaining unopened cases
    document.querySelectorAll('.case').forEach((c,i) => {
      const idx = Number(c.dataset.index);
      if (!revealedSet.has(idx) && idx !== playerCaseIndex) c.style.pointerEvents = 'auto';
    });
  };
}

// Accepting a deal reveals player's case and shows DEAL result
function revealPlayerCaseForDeal(offer){
  // reveal player's case on board (if not already revealed)
  if (!revealedSet.has(playerCaseIndex)){
    revealCase(playerCaseIndex);
  }
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  // disable further clicks
  document.querySelectorAll('.case').forEach(c => c.style.pointerEvents = 'none');
}

// Show Keep/Switch UI for Phase 4 (NO wolfie overlay)
function showKeepSwitchUI(){
  // ensure overlay is hidden
  dealerOverlay.classList.add('hidden');
  overlayVisible = false;

  // show keep/switch panel in main area
  keepSwitchArea.classList.remove('hidden');

  // disable clicks on board while deciding
  document.querySelectorAll('.case').forEach(c => c.style.pointerEvents = 'none');

  keepBtn.onclick = async () => {
    // KEEP: do final reveals (non-original first then player's)
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(false);
  };
  switchBtn.onclick = async () => {
    // SWITCH: swap player’s case with the remaining unopened case, then final reveals
    keepSwitchArea.classList.add('hidden');
    await finalRevealSequence(true);
  };
}

// Final reveal sequence per Option A:
// - reveal the non-chosen case first (the case that is not the player's original case at the start).
// - then reveal the player's final case (depending on keep/switch).
async function finalRevealSequence(switched){
  // find the remaining unopened case aside from player's original and revealedSet
  const remainingUnopened = [...Array(8).keys()].filter(i => i !== originalPlayerIndex && !revealedSet.has(i));

  const remainingIndex = remainingUnopened.length ? remainingUnopened[0] : null;

  // Determine final player's case index after potential switch
  let finalPlayerIndex = originalPlayerIndex;
  if (switched && remainingIndex !== null){
    finalPlayerIndex = remainingIndex;
    // visually update playerCase area to the new case number
    playerCaseEl.textContent = (finalPlayerIndex + 1);
    // grey out original player's board case
    const origEl = document.querySelector(`.case[data-index='${originalPlayerIndex}']`);
    if (origEl) origEl.classList.add('greyed');
  } else {
    // if keep, ensure playerCaseEl shows original
    playerCaseEl.textContent = (originalPlayerIndex + 1);
  }

  // The "other" case to reveal first: per Option A it is the case that was NOT the player's original at the start
  const otherIndex = (originalPlayerIndex === finalPlayerIndex) ? remainingIndex : originalPlayerIndex;

  // Reveal other first (if exists and not already revealed)
  if (otherIndex !== null && !revealedSet.has(otherIndex)){
    revealCase(otherIndex);
    await sleep(revealDelay + 150);
  }

  // Reveal player final case (if not already)
  if (!revealedSet.has(finalPlayerIndex)){
    revealCase(finalPlayerIndex);
    await sleep(revealDelay);
  }

  // Show YOU WIN text for final player's prize
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + casePrizes[finalPlayerIndex];

  // block further input until reset
  document.querySelectorAll('.case').forEach(c => c.style.pointerEvents = 'none');
}

// hook reset
resetBtn.addEventListener('click', () => initGame());

// Build & start
buildUI();
initGame();