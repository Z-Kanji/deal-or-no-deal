/* Full game rebuilt with:
   - master/slave via Ably
   - revealRequest / revealConfirm to prevent premature slave reveals
   - animation suppressed for picking player's case (no slave animation on pick)
   - prize-label wrapping and centering inside open briefcase white box
   - YOU WIN text now appears below the prize and above OK inside wolfie dialog
   - prevent double-play of final flourish SFX by short suppression flag
*/

/* ---------- CONFIG: sizes & timing ---------- */
const CASE_WIDTH = 150;
const CASE_HEIGHT = 120;
const ANIM_SCALE = 0.85;
const FRAME_RATE = 24;
const ANIM_DURATION_MS = 1000 + Math.round(.05 * (1000 / FRAME_RATE));
const MIN_DEALER_DELAY_MS = 2500;
const WIN_OVERLAY_DELAY_MS = 2000;

/* ---------- ASSETS ---------- */
const assets = {
  closedCaseImg: 'closed_briefcase.png',
  animImg: 'case_animation.png', // APNG
  openCaseImg: 'open_briefcase.png',
  wolfieImg: 'wolfie_dealer.png',
  bgMusic: 'theme_song.mp3',
  dealerCall: 'dealer_call.mp3',
  biggestPrizeSfx: 'biggest_prize.mp3',
  mediumPrizeSfx: 'medium_prize.mp3',
  smallPrizeSfx: 'small_prize.mp3'
};

/* ---------- PRIZES ---------- */
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
const OFFER_ALLOWED = ["t-shirt","signed poster","luigi","women"];

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

/* SFX suppression flag to avoid duplicate flourish playback */
let lastWinSfxPlayed = false;

/* ---------- AUDIO ELEMENTS ---------- */
const bgAudio = document.getElementById('bgAudio');
const dealerAudio = document.getElementById('dealerAudio');
const biggestAudio = document.getElementById('biggestAudio');
const mediumAudio = document.getElementById('mediumAudio');
const smallAudio = document.getElementById('smallAudio');

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
const dealBtn = document.getElementById('dealBtn');
const noDealBtn = document.getElementById('noDealBtn');

const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');

const winOverlay = document.getElementById('winOverlay');
const winWolfie = document.getElementById('winWolfie');
const winPrizeText = document.querySelector('#winOverlay .win-prize-text');
const winOkBtn = document.getElementById('winOkBtn');

const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');
const caseAnimImg = document.getElementById('caseAnim');

wolfieImgEl.src = assets.wolfieImg;
winWolfie.src = assets.wolfieImg;

/* ---------- UTILS ---------- */
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ---------- URL params & slave detection ---------- */
const urlParams = new URLSearchParams(location.search);
const IS_SLAVE = urlParams.get('slave') === '1' || urlParams.get('mode') === 'slave';
const URL_ABLY_KEY = urlParams.get('ablyKey') || null;

/* ---------- ABLY key (embedded) ---------- */
const EMBEDDED_ABLY_KEY = 'U4A72w.4W1fdQ:oTpv1lav0NvdYwzCYwO5W50FTG6l6N4k5OpKpaaDVyQ';
const ABLY_KEY = URL_ABLY_KEY || EMBEDDED_ABLY_KEY;

/* ---------- ABLY setup ---------- */
let ably = null;
let ablyChannel = null;
function setupAbly(key){
  if (!key) return;
  try {
    ably = new Ably.Realtime(key);
    ablyChannel = ably.channels.get('deal-game-channel');
    ablyChannel.subscribe((msg) => {
      if (!msg || !msg.data) return;
      if (IS_SLAVE) handleMasterEvent(msg.data);
    });
    ably.connection.on('connected', () => console.log('Ably connected'));
    ably.connection.on('failed', (err) => console.warn('Ably connection failed', err));
  } catch (e){
    console.warn('Ably init error', e);
  }
}
function ablyPublish(obj){
  if (!ablyChannel) return;
  try { ablyChannel.publish('masterEvent', obj); } catch(e){ console.warn('Ably publish failed', e); }
}
if (ABLY_KEY) setupAbly(ABLY_KEY);

/* ---------- UI BUILD (both master & slave) ---------- */
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
    wrap.className = 'case-wrap';
    wrap.dataset.index = i;

    const img = document.createElement('div');
    img.className = 'case-img';
    img.style.backgroundImage = `url(${assets.closedCaseImg})`;
    img.dataset.index = i;

    const num = document.createElement('div');
    num.className = 'case-number';
    num.textContent = (i+1);

    wrap.appendChild(img);
    wrap.appendChild(num);

    // only master reacts to clicks; slave mirrors via Ably events
    wrap.addEventListener('click', async () => {
      if (IS_SLAVE) return;
      if (overlayVisible) return;
      if (revealedSet.has(i)) return;
      if (playerCaseIndex !== null && i === playerCaseIndex) return; // selecting your case is pick, not reveal
      lastRevealClickStart = Date.now();

      // Only publish revealRequest when we are actually revealing (phase 1-3)
      if (phase >= 1){
        if (ABLY_KEY) ablyPublish({ type:'revealRequest', index:i, casePrizes });
      }

      await onCaseClicked(i);
    });

    boardEl.appendChild(wrap);
  }

  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent = '?';

  // button wiring (master only)
  dealBtn.onclick = () => { if (IS_SLAVE) return; onDealClicked(); };
  noDealBtn.onclick = () => { if (IS_SLAVE) return; onNoDealClicked(); };
  keepBtn.onclick = () => { if (IS_SLAVE) return; onKeepClicked(); };
  switchBtn.onclick = () => { if (IS_SLAVE) return; onSwitchClicked(); };
  winOkBtn.onclick = () => { if (IS_SLAVE) return; winOverlay.classList.add('hidden'); };
  resetBtn.onclick = () => { if (IS_SLAVE) return; initGame(); ablyPublish({ type:'reset' }); };
}

/* ---------- game lifecycle ---------- */
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
  lastWinSfxPlayed = false;

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

  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'init', casePrizes });
}

/* ---------- interactivity gating ---------- */
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

/* ---------- audio control ---------- */
function ensureBackgroundStarted(){
  if (bgStarted) return;
  bgStarted = true;
  try { bgAudio.currentTime = 0; bgAudio.play().catch(()=>{}); } catch(e){}
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'sound', action:'bgStart' });
}
function stopBackground(){
  try { bgAudio.pause(); bgAudio.currentTime = 0; } catch(e){}
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'sound', action:'bgStop' });
}

/* ---------- master click handlers ---------- */
async function onCaseClicked(index){
  if (overlayVisible) return;
  ensureBackgroundStarted();

  // If player hasn't picked their case yet, this click picks it (phase 0)
  if (phase === 0){
    playerCaseIndex = index;
    originalPlayerIndex = index;
    playerCaseNumberEl.textContent = index+1;
    playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
    const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
    if (wrap) wrap.classList.add('case-grey');
    phase = 1; picksNeeded = 3;
    titleEl.textContent = `Phase 1 — Pick ${picksNeeded} case(s) to open`;
    updateBoardInteractivity();
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'playerPick', index });
    return;
  }

  // From phases 1-3: clicking opens a case (not the player's own)
  if (phase >=1 && phase <=3){
    if (index === playerCaseIndex) return;
    overlayVisible = true;
    updateBoardInteractivity();

    // publish revealRequest BEFORE playing animation so slave can animate simultaneously
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'revealRequest', index, casePrizes });

    await revealCaseWithAnimation(index, { cueWin: false });

    // confirm reveal (include casePrizes for slaves)
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'revealConfirm', index, casePrizes });

    picksNeeded--;
    overlayVisible = false;

    if (picksNeeded > 0){
      titleEl.textContent = `Pick ${picksNeeded} more case(s)`;
      updateBoardInteractivity();
    } else {
      // ensure minimum dealer delay from click to dealer overlay
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

/* ---------- reveal animation (plays APNG once then swaps to open image) ---------- */
let currentOfferText = 'No Offer';
async function revealCaseWithAnimation(index, options = { cueWin: false }){
  if (revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  const img = wrap.querySelector('.case-img');
  const num = wrap.querySelector('.case-number');

  if (num) num.style.display = 'none';

  // position and size APNG centered on case
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

  // show APNG once (cache-bust)
  caseAnimImg.src = assets.animImg + '?_=' + Date.now();
  caseAnimImg.classList.remove('hidden');

  // if cueWin requested, play win SFX now (so it happens during animation) and suppress later flourish
  if (options.cueWin){
    const prize = casePrizes[index];
    playWinSfxForPrize(prize);
    // notify slaves to play win SFX
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'sound', action:'winSfx', prize });
    // mark that we've just played the win sfx so final overlay doesn't repeat it
    lastWinSfxPlayed = true;
    setTimeout(()=>{ lastWinSfxPlayed = false; }, 3000);
  }

  // wait animation duration
  await sleep(ANIM_DURATION_MS);

  // hide APNG and swap to open image (same size)
  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';

  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents = 'none';

  // add prize label centered (inside white box)
  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = casePrizes[index];

  // grey sidebar entry (master publishes; slave will mirror)
  const pIdx = prizeListOrdered.findIndex(p => casePrizes[index] === p);
  if (pIdx >= 0){
    const li = document.getElementById('prize-'+pIdx);
    if (li) li.classList.add('greyed');
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'prizeGrey', index: pIdx });
  }
}

/* ---------- dealer offer computation (excludes disallowed prizes) ---------- */
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

  // second dealer call: offer middle prize among remaining (non-highest if possible)
  if (dealerCallCount === 2){
    const arr = nonHighest.length ? nonHighest : remaining;
    const mid = Math.floor((arr.length - 1) / 2);
    return arr[mid].p;
  }

  // primary: pick from allowed list excluding disallowed items (.01, sticker, jbl, ninja)
  let candidates = nonHighest.filter(r => {
    const key = r.p.toLowerCase();
    if (key.includes('.01') || key.includes('sticker') || key.includes('jbl') || key.includes('ninja')) return false;
    return OFFER_ALLOWED.some(a => key.includes(a));
  });

  if (candidates.length === 0){
    candidates = nonHighest.filter(r => {
      const key = r.p.toLowerCase();
      return !(key.includes('.01') || key.includes('sticker') || key.includes('jbl') || key.includes('ninja'));
    });
  }

  if (candidates.length === 0){
    candidates = nonHighest.length ? nonHighest : remaining;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return pick ? pick.p : remaining[0].p;
}

/* ---------- show dealer overlay (master) ---------- */
function showDealerOffer(){
  overlayVisible = true;
  updateBoardInteractivity();

  const offer = computeDealerOffer();
  currentOfferText = offer;
  offerText.textContent = 'OFFER: ' + offer;

  // play dealer SFX (master) and tell slave to play it
  try { dealerAudio.currentTime = 0; dealerAudio.play().catch(()=>{}); } catch(e){}
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'sound', action:'dealerSfx' });

  dealerOverlay.classList.remove('hidden');

  document.querySelectorAll('.case-wrap').forEach(w => w.style.pointerEvents = 'none');

  // wire buttons (master only)
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

/* ---------- reveal player's case for DEAL accepted ---------- */
async function revealPlayerCaseForDeal(offer){
  // reveal player's case (cue SFX)
  if (!revealedSet.has(playerCaseIndex)){
    await revealCaseWithAnimation(playerCaseIndex, { cueWin: true });
  }
  playerCaseImgEl.style.backgroundImage = `url(${assets.openCaseImg})`;
  winText.classList.remove('hidden');
  winText.textContent = 'DEAL ACCEPTED: ' + offer;
  document.querySelectorAll('.case-wrap').forEach(w=> w.style.pointerEvents = 'none');
}

/* ---------- show keep/switch UI (master) ---------- */
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

/* ---------- final reveal sequence (master) ---------- */
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
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'revealRequest', index: otherIndex, casePrizes });
    await revealCaseWithAnimation(otherIndex);
    await sleep(ANIM_DURATION_MS + 200);
  }

  if (!revealedSet.has(finalPlayerIndex)){
    if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'revealRequest', index: finalPlayerIndex, casePrizes });
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
  // plays the appropriate SFX once and sets suppression flag for a short time
  const p = (prize || '').toLowerCase();
  try {
    if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); }
    else if (p.includes('luigi') || p.includes('women') || p.includes('signed')) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); }
    else { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); }
  } catch(e){}
  lastWinSfxPlayed = true;
  setTimeout(()=>{ lastWinSfxPlayed = false; }, 3000);
}

/* ---------- handle master events on slave (mirror-only) ---------- */
async function handleMasterEvent(ev){
  if (!ev || !ev.type) return;
  switch(ev.type){
    case 'init':
      casePrizes = ev.casePrizes ? ev.casePrizes.slice() : casePrizes;
      break;

    case 'playerPick':
      playerCaseIndex = ev.index;
      originalPlayerIndex = ev.index;
      playerCaseNumberEl.textContent = (playerCaseIndex+1);
      const pickWrap = document.querySelector(`.case-wrap[data-index='${playerCaseIndex}']`);
      if (pickWrap) pickWrap.classList.add('case-grey');
      break;

    case 'revealRequest':
      // play animation on slave but DO NOT show prize label until revealConfirm arrives
      await playAnimationSlave(ev.index);
      break;

    case 'revealConfirm':
      if (ev.casePrizes) casePrizes = ev.casePrizes.slice();
      mirrorRevealCase(ev.index, casePrizes[ev.index]);
      break;

    case 'prizeGrey':
      const li = document.getElementById('prize-'+ev.index);
      if (li) li.classList.add('greyed');
      break;

    case 'dealerOffer':
      currentOfferText = ev.offer || 'No Offer';
      offerText.textContent = 'OFFER: ' + currentOfferText;
      dealerOverlay.classList.remove('hidden');
      try { dealerAudio.currentTime = 0; dealerAudio.play().catch(()=>{}); } catch(e){}
      break;

    case 'noDeal':
      dealerOverlay.classList.add('hidden');
      break;

    case 'dealAccepted':
      dealerOverlay.classList.add('hidden');
      await revealCaseOnSlave(ev.playerIndex || playerCaseIndex, ev.offer);
      await sleep(WIN_OVERLAY_DELAY_MS);
      showWinOverlaySlave(ev.offer);
      break;

    case 'phase4':
      keepSwitchArea.classList.remove('hidden');
      break;

    case 'finalReveal':
      showWinOverlaySlave(ev.finalPrize || ev.prize);
      break;

    case 'showWin':
      showWinOverlaySlave(ev.prize);
      break;

    case 'sound':
      handleSoundEvent(ev);
      break;

    case 'reset':
      initGame();
      break;

    default:
      console.log('unknown master event', ev);
  }
}

/* ---------- slave helper: play APNG animation without revealing prize ---------- */
async function playAnimationSlave(index){
  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  if (!wrap) return;
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

  await sleep(ANIM_DURATION_MS);

  caseAnimImg.classList.add('hidden');
  caseAnimImg.src = '';
}

/* ---------- slave helper: show opened case and label when master confirms ---------- */
function mirrorRevealCase(index, prize){
  const wrap = document.querySelector(`.case-wrap[data-index='${index}']`);
  if (!wrap) return;
  const img = wrap.querySelector('.case-img');

  img.style.backgroundImage = `url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');

  let prizeLabel = wrap.querySelector('.prize-label');
  if (!prizeLabel){
    prizeLabel = document.createElement('div');
    prizeLabel.className = 'prize-label';
    wrap.appendChild(prizeLabel);
  }
  prizeLabel.textContent = prize;

  const pIdx = prizeListOrdered.findIndex(p => prize === p);
  if (pIdx >= 0){
    const li = document.getElementById('prize-'+pIdx);
    if (li) li.classList.add('greyed');
  }
}

/* ---------- slave helper: reveal player's case (final) ---------- */
async function revealCaseOnSlave(index, prize){
  await playAnimationSlave(index);
  mirrorRevealCase(index, prize);
}

/* ---------- slave helper: show you win overlay (text only) ---------- */
function showWinOverlaySlave(prize){
  winPrizeText.textContent = prize;
  winOverlay.classList.remove('hidden');

  // play flourish SFX on slave only if we didn't just play one during reveal
  if (!lastWinSfxPlayed){
    const p = (''+prize).toLowerCase();
    try {
      if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); }
      else if (p.includes('luigi') || p.includes('women') || p.includes('signed')) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); }
      else { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); }
    } catch(e){}
    lastWinSfxPlayed = true;
    setTimeout(()=>{ lastWinSfxPlayed = false; }, 3000);
  }
}

/* ---------- sound events (slave handles) ---------- */
function handleSoundEvent(ev){
  if (!ev || !ev.action) return;
  try {
    switch(ev.action){
      case 'bgStart': bgAudio.currentTime = 0; bgAudio.play().catch(()=>{}); break;
      case 'bgStop': bgAudio.pause(); bgAudio.currentTime = 0; break;
      case 'dealerSfx': dealerAudio.currentTime = 0; dealerAudio.play().catch(()=>{}); break;
      case 'winSfx':
        // choose sfx based on prize (this is the cue played during reveal)
        const prize = ev.prize || '';
        playWinSfxForPrize(prize);
        break;
      default: break;
    }
  } catch(e){}
}

/* ---------- keyboard bindings (master only) ---------- */
document.addEventListener('keydown', (ev) => {
  if (IS_SLAVE) return;
  const k = (ev.key || '').toLowerCase();

  if (/^[1-8]$/.test(k)){
    const idx = parseInt(k, 10) - 1;
    const wrap = document.querySelector(`.case-wrap[data-index='${idx}']`);
    if (wrap && !revealedSet.has(idx) && !overlayVisible && !(playerCaseIndex !== null && idx === playerCaseIndex)) {
      lastRevealClickStart = Date.now();
      // Only publish revealRequest for reveals (phase >=1)
      if (phase >= 1 && ABLY_KEY) ablyPublish({ type:'revealRequest', index: idx, casePrizes });
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

/* ---------- master button actions publish events as needed ---------- */
function onDealClicked(){
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'dealAccepted', offer: currentOfferText, playerIndex: playerCaseIndex });
}
function onNoDealClicked(){
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'noDeal' });
}
function onKeepClicked(){
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'keepChosen' });
}
function onSwitchClicked(){
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'switchChosen' });
}

/* ---------- master-side showWinOverlay (text-only) ---------- */
function showWinOverlay(prize){
  // stop background music gracefully
  stopBackground();

  winPrizeText.textContent = prize;
  winOverlay.classList.remove('hidden');

  // play flourish SFX on master only if we didn't just play one during reveal
  if (!lastWinSfxPlayed){
    const p = (''+prize).toLowerCase();
    try {
      if (p.includes('jbl') || p.includes('ninja')) { biggestAudio.currentTime = 0; biggestAudio.play().catch(()=>{}); }
      else if (p.includes('luigi') || p.includes('women') || p.includes('signed')) { mediumAudio.currentTime = 0; mediumAudio.play().catch(()=>{}); }
      else { smallAudio.currentTime = 0; smallAudio.play().catch(()=>{}); }
    } catch(e){}
    lastWinSfxPlayed = true;
    setTimeout(()=>{ lastWinSfxPlayed = false; }, 3000);
  }

  // publish to slaves that we show the win overlay (so they can mirror)
  if (!IS_SLAVE && ABLY_KEY) ablyPublish({ type:'showWin', prize });
}

/* ---------- reset & start ---------- */
buildUI();
initGame();
