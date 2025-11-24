/* Full game + Ably integration
   - Place in repo root
   - Ably key is embedded below (as requested)
   - Use ?slave=1 in URL for Daktronics display to run in slave/listen mode
*/

/* ---------- CONFIG ---------- */
const assets = {
  closedCaseImg: 'closed_briefcase.png',
  animImg: 'case_animation.png',
  openCaseImg: 'open_briefcase.png',
  wolfieImg: 'wolfie_dealer.png',
  bgMusic: 'theme_song.mp3',
  dealerCall: 'dealer_call.mp3',
  biggestPrizeSfx: 'biggest_prize.mp3',
  mediumPrizeSfx: 'medium_prize.mp3',
  smallPrizeSfx: 'small_prize.mp3'
};

const prizeListOrdered = [
  ".01",
  "Sticker",
  "T-shirt",
  "Signed poster",
  "Luigi's gift card",
  "Women's basketball tickets",
  "JBL Go 4",
  "Ninja Creami"
];

const allowedOfferPrizes = ["t-shirt","signed poster","luigi","women","womens"]; // lowercase match

const FRAME_RATE = 24;
const ANIM_DURATION_MS = 1000 + Math.round(2 * (1000 / FRAME_RATE)); // ~1083ms
const MIN_DEALER_DELAY_MS = 3000;
const WIN_OVERLAY_DELAY_MS = 2000;
const CASE_WIDTH = 150;
const CASE_HEIGHT = 120;
const ANIM_SCALE = 2.0;

/* ---------- URL params ---------- */
const urlParams = new URLSearchParams(location.search);
const IS_SLAVE = urlParams.get('slave') === '1';

/* ---------- ABLY KEY (embedded per request) ---------- */
/* You provided this key; it's placed here so pages can connect directly.
   If you'd prefer, you can remove this and pass ?ablyKey=YOURKEY in the URL instead. */
const EMBEDDED_ABLY_KEY = 'U4A72w.4W1fdQ:oTpv1lav0NvdYwzCYwO5W50FTG6l6N4k5OpKpaaDVyQ';
const URL_ABLY_KEY = urlParams.get('ablyKey');
const ABLY_KEY = URL_ABLY_KEY || EMBEDDED_ABLY_KEY;

/* ---------- STATE ---------- */
let casePrizes = [];
let playerCaseIndex = null;
let originalPlayerIndex = null;
let phase = 0;
let picksNeeded = 0;
let revealedSet = new Set();
let overlayVisible = false;
let bgStarted = false;
let dealerCallCount = 0;
let lastRevealClickStart = 0;

/* ---------- AUDIO ---------- */
const bgAudio = new Audio(assets.bgMusic); bgAudio.loop = true; bgAudio.volume = 0.5;
const dealerAudio = new Audio(assets.dealerCall); dealerAudio.volume = 0.95;
const biggestAudio = new Audio(assets.biggestPrizeSfx);
const mediumAudio = new Audio(assets.mediumPrizeSfx);
const smallAudio = new Audio(assets.smallPrizeSfx);

/* ---------- DOM ---------- */
const prizeLeftEl = document.getElementById('prizeLeft');
const prizeRightEl = document.getElementById('prizeRight');
const boardEl = document.getElementById('board');
const playerCaseEl = document.getElementById('playerCase');
const playerCaseImgEl = playerCaseEl.querySelector('.case-img');
const playerCaseNumberEl = playerCaseEl.querySelector('.case-number');
const titleEl = document.getElementById('title');

const dealerOverlay = document.getElementById('dealerOverlay');
const wolfieImgEl = document.getElementById('wolfieImg');
const offerText = document.getElementById('offerText');
const dealerButtons = document.getElementById('dealerButtons');
const dealBtn = document.getElementById('dealBtn');
const noDealBtn = document.getElementById('noDealBtn');

const winOverlay = document.getElementById('winOverlay');
const winWolfie = document.getElementById('winWolfie');
const winCaseImg = document.querySelector('#winOverlay .win-case-img');
const winPrizeText = document.querySelector('#winOverlay .win-prize-text');
const winOkBtn = document.getElementById('winOkBtn');

const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');

const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');

const caseAnimImg = document.getElementById('caseAnim');

wolfieImgEl.src = assets.wolfieImg;
winWolfie.src = assets.wolfieImg;

/* ---------- UTILS ---------- */
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------- ABLY (client-only) ---------- */
let ably = null;
let ablyChannel = null;
function setupAbly(key){
  if (!key) return;
  try {
    ably = new Ably.Realtime(key);
    ablyChannel = ably.channels.get('deal-game-channel');
    ablyChannel.subscribe((msg) => {
      const m = msg.data;
      if (!m || !m.type) return;
      // only slaves apply remote messages; if master wants echo handling it can also listen
      if (IS_SLAVE) handleRemoteMessage(m);
    });
    ably.connection.on('connected', () => console.log('Ably connected'));
  } catch(e){
    console.warn('Ably init failed', e);
  }
}
function ablyPublish(obj){
  if (!ablyChannel) return;
  try { ablyChannel.publish('state', obj); } catch(e){ console.warn('Ably publish failed', e); }
}
if (ABLY_KEY) setupAbly(ABLY_KEY);

/* ---------- UI BUILD ---------- */
function buildUI(){
  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  prizeListOrdered.slice(0,4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id='prize-'+i; li.textContent=p; prizeLeftEl.appendChild(li);
  });
  prizeListOrdered.slice(4).forEach((p,i)=>{
    const li = document.createElement('li'); li.id='prize-'+(i+4); li.textContent=p; prizeRightEl.appendChild(li);
  });

  boardEl.innerHTML = '';
  for(let i=0;i<8;i++){
    const wrap = document.createElement('div');
    wrap.className='case-wrap';
    wrap.dataset.index = i;

    const img = document.createElement('div');
    img.className='case-img';
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.dataset.index = i;

    const num = document.createElement('div');
    num.className='case-number';
    num.textContent = (i+1);

    wrap.appendChild(img);
    wrap.appendChild(num);
    wrap.addEventListener('click', async () => {
      if (IS_SLAVE) return;
      if (overlayVisible) return;
      if (revealedSet.has(i)) return;
      if (playerCaseIndex !== null && i === playerCaseIndex) return;
      lastRevealClickStart = Date.now();
      if (ABLY_KEY) ablyPublish({ type:'revealRequest', index:i });
      await onCaseClicked(i);
      if (ABLY_KEY) ablyPublish({ type:'reveal', index:i, casePrizes });
    });
    boardEl.appendChild(wrap);
  }

  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';
}

/* ---------- INTERACTIVITY ---------- */
function updateBoardInteractivity(){
  document.querySelectorAll('.case-wrap').forEach((wrap,i)=>{
    if (IS_SLAVE){ wrap.style.pointerEvents = 'none'; return; }
    if (overlayVisible){ wrap.style.pointerEvents = 'none'; return; }
    if (revealedSet.has(i)){ wrap.style.pointerEvents = 'none'; return; }
    if (phase === 0){ wrap.style.pointerEvents = 'auto'; return; }
    if (playerCaseIndex !== null && i === playerCaseIndex){ wrap.style.pointerEvents = 'none'; return; }
    if ((phase >=1 && phase <=3) && !revealedSet.has(i)){ wrap.style.pointerEvents = 'auto'; return; }
    wrap.style.pointerEvents = 'none';
  });
}

/* ---------- GAME INIT ---------- */
function initGame(){
  casePrizes = shuffle(prizeListOrdered);
  playerCaseIndex = null;
  originalPlayerIndex = null;
  phase = 0;
  picksNeeded = 0;
  revealedSet.clear();
  overlayVisible = false;
  bgStarted = false;
  dealerCallCount = 0;
  lastRevealClickStart = 0;

  document.querySelectorAll('.case-wrap').forEach(wrap=>{
    wrap.classList.remove('case-open','case-grey');
    const img = wrap.querySelector('.case-img');
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.style.pointerEvents = 'auto';
    const num = wrap.querySelector('.case-number'); if (num) num.style.display = 'block';
    const pl = wrap.querySelector('.prize-label'); if (pl) pl.remove();
  });

  prizeListOrdered.forEach((_,i)=>{ const li=document.getElementById('prize-'+i); if(li) li.classList.remove('greyed'); });

  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';

  offerText.textContent = 'OFFER: --';
  keepSwitchArea.classList.add('hidden');
  dealerOverlay.classList.add('hidden');
  winOverlay.classList.add('hidden');
  winText.classList.add('hidden');

  titleEl.textContent = 'Choose your personal case';
  updateBoardInteractivity();

  if (!IS_SLAVE && ABLY_KEY) {
    ablyPublish({ type: 'init', casePrizes });
  }
}

/* ---------- BG AUDIO ---------- */
function ensureBackgroundStarted(){
  if (bgStarted) return;
  bgStarted = true;
  bgAudio.currentTime = 0;
  bgAudio.play().catch(()=>{});
}

/* ---------- click handler ---------- */
async function onCaseClicked(index){
  if (overlayVisible) return;
  ensureBackgroundStarted();

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  if (!wrap) return;
  if (revealedSet.has(index)) return;

  if (phase === 0){
    playerCaseIndex = index;
    originalPlayerIndex = index;
    playerCaseNumberEl.textContent = index+1;
    playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
    wrap.classList.add('case-grey');
    wrap.style.pointerEvents = 'none';
    phase = 1; picksNeeded = 3;
    titleEl.textContent = `Phase 1 — Pick ${picksNeeded} case(s) to open`;
    updateBoardInteractivity();
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'playerPick', index });
    return;
  }

  if (phase >=1 && phase <=3){
    if (index === playerCaseIndex) return;

    overlayVisible = true;
    updateBoardInteractivity();

    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'revealRequest', index });

    await revealCaseWithAnimation(index, { cueWin: false });

    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'reveal', index, casePrizes });

    picksNeeded--;
    overlayVisible = false;

    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
      updateBoardInteractivity();
    } else {
      const elapsed = Date.now() - lastRevealClickStart;
      const remaining = MIN_DEALER_DELAY_MS - elapsed;
      if (remaining > 0) await sleep(remaining);

      if (phase === 1 || phase === 2){
        dealerCallCount++;
        showDealerOffer();
        if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'dealerOffer', offer: currentOfferText, dealerCallCount });
      } else if (phase === 3){
        phase = 4;
        showKeepSwitchUI();
        if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'phase4' });
      }
    }
  }
}

/* ---------- reveal with animation ---------- */
let currentOfferText = 'No Offer';
async function revealCaseWithAnimation(index, options = { cueWin: false }){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  if (num) num.style.display = 'none';

  const rect = img.getBoundingClientRect();
  const overlayWidth = Math.round(CASE_WIDTH * ANIM_SCALE);
  const overlayHeight = Math.round(CASE_HEIGHT * ANIM_SCALE);
  const left = rect.left + window.scrollX + Math.round((rect.width - overlayWidth) / 2);
  const top = rect.top + window.scrollY + Math.round((rect.height - overlayHeight) / 2);

  caseAnimImg.style.width = overlayWidth + 'px';
  caseAnimImg.style.height = overlayHeight + 'px';
  caseAnimImg.style.left = left + 'px';
  caseAnimImg.style.top = top + 'px';
  caseAnimImg.style.objectFit = 'contain';

  caseAnimImg.src = assets.animImg + '?_=' + Date.now();
  caseAnimImg.classList.remove('hidden');

  if (options.cueWin){
    const prize = casePrizes[index];
    playWinSfxForPrize(prize);
  }

  await new Promise(res => setTimeout(res, ANIM_DURATION_MS));

  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';

  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0){ const li=document.getElementById('prize-'+pIdx); if (li) li.classList.add('greyed'); }
}

/* ---------- compute dealer offer ---------- */
function computeDealerOffer(){
  const remaining = [];
  for (let i=0;i<8;i++){
    if (i === playerCaseIndex) continue;
    if (revealedSet.has(i)) continue;
    remaining.push({p: casePrizes[i], idx: prizeListOrdered.indexOf(casePrizes[i])});
  }
  remaining.sort((a,b)=>a.idx-b.idx);
  if (remaining.length === 0) return "No Offer";

  const highestIdx = Math.max(...remaining.map(r=>r.idx));
  const nonHighest = remaining.filter(r => r.idx !== highestIdx);

  if (dealerCallCount === 2){
    const arr = nonHighest.length ? nonHighest : remaining;
    const mid = Math.floor((arr.length - 1) / 2);
    return arr[mid].p;
  }

  let candidates = nonHighest.filter(r => {
    const key = r.p.toLowerCase();
    return allowedOfferPrizes.some(a => key.includes(a));
  });

  if (candidates.length === 0){
    candidates = nonHighest.length ? nonHighest : remaining;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick ? pick.p : remaining[0].p;
}

/* ---------- show dealer overlay ---------- */
function showDealerOffer(){
  overlayVisible = true;
  updateBoardInteractivity();

  const offer = computeDealerOffer();
  currentOfferText = offer;
  offerText.textContent = 'OFFER: ' + offer;

  dealerAudio.currentTime = 0;
  dealerAudio.play().catch(()=>{});

  dealerOverlay.classList.remove('hidden');
  dealerButtons.classList.remove('hidden');

  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  dealBtn.onclick = async () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();

    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'dealAccepted', offer });

    await revealPlayerCaseForDeal(offer);

    await sleep(WIN_OVERLAY_DELAY_MS);
    showWinOverlay(offer);
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'showWin', prize: offer });
  };

  noDealBtn.onclick = () => {
    dealerAudio.pause();
    dealerOverlay.classList.add('hidden');
    overlayVisible = false;
    updateBoardInteractivity();
    if (phase === 1){ phase = 2; picksNeeded = 2; titleEl.textContent = `Phase 2 — Pick ${picksNeeded} case(s) to open`; }
    else if (phase === 2){ phase = 3; picksNeeded = 1; titleEl.textContent = `Phase 3 — Pick ${picksNeeded} case(s) to open`; }

    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'noDeal', phase, picksNeeded });
  };
}

/* ---------- reveal player's case for a deal ---------- */
async function revealPlayerCaseForDeal(offer){
  if (!revealedSet.has(playerCaseIndex)){
    await revealCaseWithAnimation(playerCaseIndex, { cueWin: true });
  }
  playerCaseImgEl.style.backgroundImage = `url(${assets.openCaseImg})`;
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
}

/* ---------- win overlay ---------- */
function showWinOverlay(prize){
  winCaseImg.style.backgroundImage = `url(${assets.openCaseImg})`;
  winPrizeText.textContent = prize;
  winOverlay.classList.remove('hidden');

  const p = (''+prize).toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); }
  else if (p.includes('luigi') || p.includes('women') || p.includes('signed')) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); }
  else { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); }

  overlayVisible = true;
  updateBoardInteractivity();
}

winOkBtn.onclick = () => {
  winOverlay.classList.add('hidden');
  overlayVisible = false;
  updateBoardInteractivity();
};

/* ---------- keep/switch ---------- */
function showKeepSwitchUI(){
  keepSwitchArea.classList.remove('hidden');
  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  keepBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'keepChosen' });
    await finalRevealSequence(false);
    await sleep(WIN_OVERLAY_DELAY_MS);
    const finalPrize = getFinalPrizeForDisplay();
    showWinOverlay(finalPrize);
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'finalReveal', finalPrize });
  };
  switchBtn.onclick = async () => {
    keepSwitchArea.classList.add('hidden');
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'switchChosen' });
    await finalRevealSequence(true);
    await sleep(WIN_OVERLAY_DELAY_MS);
    const finalPrize = getFinalPrizeForDisplay();
    showWinOverlay(finalPrize);
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'finalReveal', finalPrize });
  };
}

function getFinalPrizeForDisplay(){
  const idx = playerCaseIndex !== null ? playerCaseIndex : originalPlayerIndex;
  return casePrizes[idx];
}

/* ---------- final reveal ---------- */
async function finalRevealSequence(switched){
  const remainingUnopened = [...Array(8).keys()].filter(i => i !== originalPlayerIndex && !revealedSet.has(i));
  const remainingIndex = remainingUnopened.length ? remainingUnopened[0] : null;

  let finalPlayerIndex = originalPlayerIndex;
  if (switched && remainingIndex !== null){
    finalPlayerIndex = remainingIndex;
    playerCaseNumberEl.textContent = finalPlayerIndex + 1;
    playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
    const origWrap = document.querySelector(`.case-wrap[data-index='${originalPlayerIndex}']`);
    if (origWrap) origWrap.classList.add('case-grey');
  } else {
    playerCaseNumberEl.textContent = originalPlayerIndex + 1;
  }

  const otherIndex = (originalPlayerIndex === finalPlayerIndex) ? remainingIndex : originalPlayerIndex;

  if (otherIndex !== null && !revealedSet.has(otherIndex)){
    await revealCaseWithAnimation(otherIndex);
    await sleep(ANIM_DURATION_MS + 200);
  }

  if (!revealedSet.has(finalPlayerIndex)){
    await revealCaseWithAnimation(finalPlayerIndex, { cueWin: true });
    await sleep(ANIM_DURATION_MS);
  }

  const finalPrize = casePrizes[finalPlayerIndex];
  winText.classList.remove('hidden');
  winText.textContent = 'YOU WIN: ' + finalPrize;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');

  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'finalReveal', finalPlayerIndex, finalPrize });
}

/* ---------- sfx mapping ---------- */
function playWinSfxForPrize(prize){
  const p = (prize || '').toLowerCase();
  if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); return; }
  if (p.includes("women") || p.includes("luigi") || p.includes("signed poster") || p.includes("signed")) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); return; }
  smallAudio.currentTime = 0; smallAudio.play().catch(()=>{});
}

/* ---------- remote message handler (slave) ---------- */
async function handleRemoteMessage(msg){
  if (!msg || !msg.type) return;
  switch(msg.type){
    case 'init':
      casePrizes = msg.casePrizes ? msg.casePrizes.slice() : casePrizes;
      break;

    case 'playerPick':
      playerCaseIndex = msg.index;
      originalPlayerIndex = msg.index;
      playerCaseNumberEl.textContent = (playerCaseIndex+1);
      const pickWrap = document.querySelector(`.case-wrap[data-index='${playerCaseIndex}']`);
      if (pickWrap) pickWrap.classList.add('case-grey');
      break;

    case 'reveal':
      if (msg.casePrizes) casePrizes = msg.casePrizes.slice();
      await revealCaseWithAnimation(msg.index, { cueWin: false });
      break;

    case 'dealerOffer':
      currentOfferText = msg.offer || 'No Offer';
      offerText.textContent = 'OFFER: ' + currentOfferText;
      dealerOverlay.classList.remove('hidden');
      break;

    case 'dealAccepted':
      dealerOverlay.classList.add('hidden');
      await revealPlayerCaseForDeal(msg.offer);
      await sleep(WIN_OVERLAY_DELAY_MS);
      showWinOverlay(msg.offer);
      break;

    case 'noDeal':
      dealerOverlay.classList.add('hidden');
      break;

    case 'phase4':
      keepSwitchArea.classList.remove('hidden');
      break;

    case 'keepChosen':
    case 'switchChosen':
      break;

    case 'finalReveal':
      winText.classList.remove('hidden');
      winText.textContent = 'YOU WIN: ' + (msg.finalPrize || msg.prize || msg.finalPrize);
      break;

    case 'showWin':
      showWinOverlay(msg.prize);
      break;

    case 'reset':
      initGame();
      break;

    default:
      console.log('unknown remote msg', msg);
  }
}

/* ---------- keyboard (master only) ---------- */
document.addEventListener('keydown', (ev) => {
  if (IS_SLAVE) return;
  const k = (ev.key || '').toLowerCase();

  if (/^[1-8]$/.test(k)){
    const idx = parseInt(k, 10) - 1;
    const wrap = document.querySelector(`.case-wrap[data-index='${idx}']`);
    if (wrap && !revealedSet.has(idx) && !overlayVisible && !(playerCaseIndex !== null && idx === playerCaseIndex)) {
      lastRevealClickStart = Date.now();
      onCaseClicked(idx).catch(()=>{});
    }
    ev.preventDefault();
    return;
  }

  if (k === 'd'){ if (!dealerOverlay.classList.contains('hidden')) dealBtn.click(); ev.preventDefault(); return; }
  if (k === 'n'){ if (!dealerOverlay.classList.contains('hidden')) noDealBtn.click(); ev.preventDefault(); return; }
  if (k === 'k'){ if (!keepSwitchArea.classList.contains('hidden')) keepBtn.click(); ev.preventDefault(); return; }
  if (k === 's'){ if (!keepSwitchArea.classList.contains('hidden')) switchBtn.click(); ev.preventDefault(); return; }
});

/* ---------- reset handler ---------- */
resetBtn.addEventListener('click', () => { initGame(); if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'reset' }); });

/* ---------- start ---------- */
buildUI();
initGame();
