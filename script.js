// ---------- CONFIG ----------
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

// ---------- STATE ----------
let casePrizes = [];
let playerCaseIndex = null;
let originalPlayerIndex = null;
let phase = 0;
let picksNeeded = 0;
let revealedSet = new Set();
let overlayVisible = false;
let bgStarted = false;

// ---------- AUDIO ----------
const bgAudio = new Audio(assets.bgMusic); bgAudio.loop=true; bgAudio.volume=0.5;
const dealerAudio = new Audio(assets.dealerCall); dealerAudio.volume=0.95;
const biggestAudio = new Audio(assets.biggestPrizeSfx);
const mediumAudio = new Audio(assets.mediumPrizeSfx);
const smallAudio = new Audio(assets.smallPrizeSfx);

// ---------- DOM ----------
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
const keepSwitchArea = document.getElementById('keepSwitchArea');
const keepBtn = document.getElementById('keepBtn');
const switchBtn = document.getElementById('switchBtn');
const winText = document.getElementById('winText');
const resetBtn = document.getElementById('resetBtn');
const caseAnimImg = document.getElementById('caseAnim');

wolfieImgEl.src = assets.wolfieImg;

// ---------- UTIL ----------
function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ---------- UI BUILD ----------
function buildUI(){
  prizeLeftEl.innerHTML = '';
  prizeRightEl.innerHTML = '';
  const prizes = ['.01','Sticker','T-shirt','Signed poster','Luigi\'s gift card',"Women's basketball tickets",'JBL Go 4','Ninja Creami'];
  prizes.slice(0,4).forEach((p,i)=>{ const li=document.createElement('li'); li.id='prize-'+i; li.textContent=p; prizeLeftEl.appendChild(li); });
  prizes.slice(4).forEach((p,i)=>{ const li=document.createElement('li'); li.id='prize-'+(i+4); li.textContent=p; prizeRightEl.appendChild(li); });

  boardEl.innerHTML='';
  for(let i=0;i<8;i++){
    const wrap=document.createElement('div'); wrap.className='case-wrap'; wrap.dataset.index=i;
    const img=document.createElement('div'); img.className='case-img'; img.style.backgroundImage=`url(${assets.closedCaseImg})`;
    const num=document.createElement('div'); num.className='case-number'; num.textContent=i+1;
    wrap.appendChild(img); wrap.appendChild(num);
    wrap.addEventListener('click',()=>onCaseClicked(i));
    boardEl.appendChild(wrap);
  }

  // initialize player's case
  playerCaseImgEl.style.backgroundImage = `url(${assets.closedCaseImg})`;
  playerCaseNumberEl.textContent='?';
}

// ---------- GAME ----------
// Clicks, phases, reveal logic...
async function revealCaseWithAnimation(index){
  if(revealedSet.has(index)) return;
  revealedSet.add(index);

  const wrap=document.querySelector(`.case-wrap[data-index='${index}']`);
  const img=wrap.querySelector('.case-img');
  const num=wrap.querySelector('.case-number');
  num.style.display='none';

  // Show APNG overlay over the case
  const rect=img.getBoundingClientRect();
  caseAnimImg.style.width=`${img.clientWidth}px`;
  caseAnimImg.style.height=`${img.clientHeight}px`;
  caseAnimImg.style.left=`${rect.left+window.scrollX}px`;
  caseAnimImg.style.top=`${rect.top+window.scrollY}px`;
  caseAnimImg.src=assets.animImg;
  caseAnimImg.classList.remove('hidden');

  // Wait for 2.5s for APNG to play (adjust based on animation length)
  await sleep(2500);
  caseAnimImg.classList.add('hidden');

  img.style.backgroundImage=`url(${assets.openCaseImg})`;
  wrap.classList.add('case-open');
  img.style.pointerEvents='none';

  // prize label
  let prizeLabel=wrap.querySelector('.prize-label');
  if(!prizeLabel){ prizeLabel=document.createElement('div'); prizeLabel.className='prize-label'; wrap.appendChild(prizeLabel);}
  prizeLabel.textContent=casePrizes[index];

  // grey sidebar
  const pIdx=['.01','Sticker','T-shirt','Signed poster','Luigi\'s gift card',"Women's basketball tickets",'JBL Go 4','Ninja Creami'].findIndex(p=>p===casePrizes[index]);
  if(pIdx>=0){ const li=document.getElementById('prize-'+pIdx); if(li) li.classList.add('greyed'); }

  // play dealer call
  dealerAudio.currentTime=0; dealerAudio.play().catch(()=>{});
}

// ---------- INIT ----------
resetBtn.addEventListener('click',()=>initGame());
buildUI(); initGame();
