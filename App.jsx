import React, { useState, useEffect, useRef } from 'react';
import { Shield as HeaderShield, Zap, AlertCircle, Sparkles, Plus, Minus, ArrowLeft, Skull, ShoppingCart, Trash2, ArrowUpCircle, Play, FlaskConical, RefreshCw } from 'lucide-react';

// ============================================================================
// 📊 資料表預設值 (全數將被 Google Sheet 覆寫)
// ============================================================================
let GameConfig = {
  constants: {
    BATTLEFIELD_WIDTH: 1500, BASE_WIDTH: 120, PLAYER_BASE_X: 180, ENEMY_BASE_X: 1320,
    INITIAL_DP: 0, INITIAL_MAX_DP: 5, DP_REGEN_BASE_INTERVAL: 2,
    DP_REGEN_UPGRADE_SCALING: 0.4, DP_MAX_UPGRADE_ADD: 5,
    MAX_DECK_SIZE: 20, PLAYER_BASE_HP: 1000, UPGRADE_DROP_INTERVAL: 30,
    UNLOCK_STAGE_FUSION: 2, UNLOCK_STAGE_DELETE: 2, UNLOCK_STAGE_REROLL: 1,
    REROLL_BASE_COST: 10, REROLL_COST_INCREMENT: 5
  },
  initialDeck: ['goblin', 'wolf', 'elf', 'rage_potion', 'stone_armor', 'fire_enchant'],
  difficultySettings: {}
};

let CardDatabase = {
  goblin: { id: 'goblin', category: 'entity', name: '哥布林', cost: 2, type: 'melee', hp: 120, maxHp: 120, attack: 15, minRange: 0, maxRange: 40, speed: 45, cooldown: 1, count: 1, size: 1, color: 'bg-green-700', desc: '【基礎素體】\n防線基石。' },
  upgrade: { id: 'upgrade', category: 'spell', name: '禁忌知識', cost: 'dynamic', isToken: true, color: 'bg-purple-800', desc: '【主堡研發】' },
  abomination: { id: 'abomination', category: 'entity', name: '失控畸變體', cost: 0, type: 'melee', hp: 400, maxHp: 400, attack: 0, minRange: 0, maxRange: 20, speed: 70, cooldown: 99, count: 1, size: 3, isToken: true, isAbomination: true, color: 'bg-rose-900', desc: '【崩壞產物】' },
  monolith: { id: 'monolith', category: 'entity', name: '擋路石碑', cost: 0, type: 'melee', hp: 1500, maxHp: 1500, attack: 0, minRange: 0, maxRange: 0, speed: 0, cooldown: 99, count: 1, size: 3, isToken: true, color: 'bg-stone-400', desc: '【臨時實體】' },
};

let StageConfig = {
  1: { id: 1, name: "邊境森林 (Stage 1)", baseHp: 1000, enemyBaseHp: 2000, rewardGold: 50, clearTime: 60, bonusGold: 50, bonusMaxTime: 30, bonusPenaltyInterval: 5, bonusPenaltyAmount: 5, distance: 1140 }
};

let SpawnTimeline = [
  { stageId: 1, time: 5, enemyId: 'goblin', count: 3, interval: 1.0 }
];

let ShopConfig = {
  goblin: { id: 'goblin', tier: 1, basePrice: 15, upPrice: 25, w1: 100, w2: 50 }
};

// ============================================================================
// 🛠 工具函式
// ============================================================================
const CssIcon = ({ id, className }) => <div className={`icon-mask icon-${id} ${className}`} />;

const parseCSV = (str) => {
  const arr = []; let quote = false; let col = 0, row = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || []; arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  if (arr.length === 0) return [];
  const headers = arr[0].map(h => h.trim());
  return arr.slice(1).map(rowValues => {
    const obj = {};
    headers.forEach((header, index) => { obj[header] = rowValues[index] !== undefined ? rowValues[index] : ''; });
    return obj;
  });
};

const getFusionResultCard = (sourceCard, targetCard) => {
  if (!sourceCard || !targetCard) return null;
  let newCard = null;
  const isSrcEntity = sourceCard.category === 'entity';
  const isTgtEntity = targetCard.category === 'entity';
  const isSrcAffix = sourceCard.category === 'affix';
  const isTgtAffix = targetCard.category === 'affix';

  if ((isSrcEntity && isTgtAffix) || (isSrcAffix && isTgtEntity)) {
      const entity = isSrcEntity ? sourceCard : targetCard;
      const affix = isSrcAffix ? sourceCard : targetCard;
      const currentAffixes = entity.fusedAffixes || [];
      if (currentAffixes.length < 2) {
        newCard = { ...entity, name: `${affix.name}的${entity.name}`, cost: entity.cost + affix.cost, isPreArmed: true, originalEntity: entity.originalEntity || { ...entity, fusedAffixes: undefined }, fusedAffixes: [...currentAffixes, affix], desc: `【戰前武裝】\n\n進場自帶「${affix.name}」增強效果。\n\n${entity.desc}` };
      }
  } else if (isSrcEntity && isTgtEntity) {
      const id1 = sourceCard.baseId || sourceCard.id;
      const id2 = targetCard.baseId || targetCard.id;

      if (id1 === id2 && !sourceCard.isElite && !sourceCard.isAbomination && !sourceCard.isToken) {
          newCard = { ...sourceCard, name: `精英${sourceCard.name}`, cost: sourceCard.cost * 2, hp: Math.floor(sourceCard.hp * 1.8), maxHp: Math.floor(sourceCard.maxHp * 1.8), attack: Math.floor(sourceCard.attack * 1.8), size: (sourceCard.size || 1) + 1, isElite: true, isToken: true, color: 'bg-yellow-500', desc: `【精英首領】\n\n純化血脈的精英，全屬性大幅提升。\n\n${sourceCard.desc}` };
      } else if (!sourceCard.isElite && !targetCard.isElite && !sourceCard.isAbomination && !targetCard.isAbomination) {
          const combo = [id1, id2].sort().join('+');
          if (combo === 'goblin+wolf') newCard = { ...CardDatabase.goblin_knight };
          else if (combo === 'elf+goblin') newCard = { ...CardDatabase.goblin_mage };
          else if (combo === 'elf+goblin_knight' || combo === 'goblin_mage+wolf') newCard = { ...CardDatabase.goblin_magic_knight };
          else newCard = { ...CardDatabase.abomination };
      } else newCard = { ...CardDatabase.abomination };

      if (newCard) newCard.fusionMaterials = [sourceCard, targetCard];
  }
  return newCard;
};

const getDeckCardInfo = (pCard) => {
  let card = { ...CardDatabase[pCard.baseId] };
  if (!card.id) return null;

  if (pCard.isElite) {
      card.name = `精英${card.name}`;
      card.cost *= 2;
      card.hp = Math.floor(card.hp * 1.8);
      card.maxHp = Math.floor(card.maxHp * 1.8);
      card.attack = Math.floor(card.attack * 1.8);
      card.size = (card.size || 1) + 1;
      card.isElite = true;
      card.color = 'bg-yellow-500';
      card.desc = `【精英首領】\n\n純化血脈的精英，全屬性大幅提升。\n\n${card.desc}`;
  }

  if (pCard.fusedAffixes && pCard.fusedAffixes.length > 0) {
      const affixNames = pCard.fusedAffixes.map(a => a.name).join('與');
      card.name = `${affixNames}的${card.name}`;
      card.cost += pCard.fusedAffixes.reduce((sum, a) => sum + a.cost, 0);
      card.fusedAffixes = pCard.fusedAffixes;
      card.desc = `【戰前武裝】\n\n進場自帶增強效果。\n\n${card.desc}`;
  }

  return card;
};

// ============================================================================
// 🎮 遊戲主元件
// ============================================================================
export default function App() {
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [gold, setGold] = useState(0);
  const [goldUIVisible, setGoldUIVisible] = useState(false); 
  const [currentStageId, setCurrentStageId] = useState(1);
  
  const [deleteCost, setDeleteCost] = useState(15);
  const [fusionCost, setFusionCost] = useState(20); 
  const [rerollCost, setRerollCost] = useState(10); 

  const [shopCards, setShopCards] = useState([]);
  const [selectedCardToDelete, setSelectedCardToDelete] = useState(null); 
  const [selectedCardsToFuse, setSelectedCardsToFuse] = useState([]); 
  
  const [playerMaxDpBonus, setPlayerMaxDpBonus] = useState(0); 
  const [playerBaseHpBonus, setPlayerBaseHpBonus] = useState(0); 
  const [baseUpgradeCost, setBaseUpgradeCost] = useState(50); 
  const [hasUpgradedCastle, setHasUpgradedCastle] = useState(false); 
  
  const [dragState, setDragState] = useState({ isDragging: false, category: null, hover: null, id: null });
  const [selectedAffixId, setSelectedAffixId] = useState(null);
  const [inspectingCard, setInspectingCard] = useState(null);

  const [unlockNotifications, setUnlockNotifications] = useState([]);
  const unlockedSet = useRef(new Set());

  const engine = useRef({
    status: 'menu', 
    dp: 0, dpMax: 10, dpRegenBaseInterval: 2, dpRegenTimer: 0,
    playerBaseHp: 1000, maxPlayerBaseHp: 1000,
    enemyBaseHp: 2000, maxEnemyBaseHp: 2000,
    enemyBaseX: 1320, battlefieldWidth: 1500, 
    deck: [], hand: [], deployed: [], discard: [], units: [], effects: [], droppedItems: [],
    timers: { draw: 0, shuffle: 0, upgradeTimer: 0 },
    flags: { isShuffling: false, isPaused: false, isWaitingForUpgradeUse: false, stageCleared: false, timeoutBossSpawned: false },
    waveTime: -5, pendingSpawns: [], timelineTriggered: new Set(), clearTime: 60,
    earnedBaseGold: 0, earnedBonusGold: 0,
    nextUnitId: 1, nextCardId: 1, nextDeployedId: 1, nextEffectId: 1
  });

  const [, setTick] = useState(0);
  const battlefieldRef = useRef(null);
  const dragRef = useRef({ id: null, el: null, startX: 0, startY: 0, isDragging: false, isLongPressing: false, longPressTimer: null });
  const mapScrollRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const generateId = () => `unit_${engine.current.nextUnitId++}`;
  const generateCardInstanceId = () => `card_${engine.current.nextCardId++}`;
  const generateDeployedId = () => `dep_${engine.current.nextDeployedId++}`;
  const generateEffectId = () => `eff_${engine.current.nextEffectId++}`;

  const shuffleArray = (array) => {
    let curId = array.length;
    while (0 !== curId) {
      let randId = Math.floor(Math.random() * curId);
      curId -= 1;
      let tmp = array[curId]; array[curId] = array[randId]; array[randId] = tmp;
    }
    return array;
  };

  useEffect(() => {
    if (engine.current.status === 'playing') {
      setGoldUIVisible(true);
      const timer = setTimeout(() => setGoldUIVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [gold]);

  // ============================================================================
  // 🔗 Google Sheets 資料擷取邏輯 (全 CSV 解析)
  // ============================================================================
  useEffect(() => {
    const fetchGoogleSheetData = async () => {
      const GOOGLE_SHEET_ID = '13MsIajwr8ANbhCx6EdyMvJmmGLKpB1JuEPqnZVYTeBc';
      const GID_CONFIG   = '460881299';  
      const GID_DIFFICULTY='874088265';  
      const GID_CARDS    = '1673309888'; 
      const GID_STAGE    = '1007452916'; 
      const GID_TIMELINE = '1635625677'; 
      const GID_SHOP     = '1745437795'; 
      
      try {
        console.log(`開始連接 Google Sheet (ID: ${GOOGLE_SHEET_ID})...`);
        let newConfig = { ...GameConfig };

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_CONFIG}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newConstants = {}, newInitialDeck = [];
            data.forEach(row => {
              if (row.category && row.key) {
                const category = row.category.trim(), key = row.key.trim(), rawValue = row.value;
                let value = rawValue;
                if (typeof rawValue === 'string') {
                   if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') value = Number(rawValue);
                   else if (rawValue.trim().toLowerCase() === 'true') value = true;
                   else if (rawValue.trim().toLowerCase() === 'false') value = false;
                }
                if (category === 'constants') newConstants[key] = value;
                else if (category === 'initialDeck') {
                  const count = typeof value === 'number' ? value : 1;
                  for (let i = 0; i < count; i++) newInitialDeck.push(key);
                }
              }
            });
            if (Object.keys(newConstants).length > 0) newConfig.constants = { ...newConfig.constants, ...newConstants };
            if (newInitialDeck.length > 0) newConfig.initialDeck = newInitialDeck;
          }
        } catch(err) { console.warn("⚠️ Config 讀取失敗", err); }

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_DIFFICULTY}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newDifficulty = {};
            data.forEach(r => {
              if (r.difficulty) {
                newDifficulty[r.difficulty] = {
                  baseHp: Number(r.baseHp) || 2000,
                  spawn: { base: Number(r.spawn_base) || 4.0, phaseMultiplier: Number(r.spawn_phaseMultiplier) || 0.5, min: Number(r.spawn_min) || 1.5 },
                  rush: { base: Number(r.rush_base) || 3, phaseMultiplier: Number(r.rush_phaseMultiplier) || 1.0 }
                };
              }
            });
            if (Object.keys(newDifficulty).length > 0) newConfig.difficultySettings = newDifficulty;
          }
        } catch(err) { console.warn("⚠️ Difficulty 讀取失敗", err); }
        GameConfig = newConfig;

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_CARDS}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newCardDB = {};
            data.forEach(rData => {
              let cardData = {};
              Object.keys(rData).forEach(col => {
                const colName = col.trim(); let val = rData[col];
                if (val === undefined || val === null || val === '') return; 
                if (typeof val === 'string') {
                  const lowerVal = val.trim().toLowerCase();
                  if (lowerVal === 'true') val = true;
                  else if (lowerVal === 'false') val = false;
                  else if (val.trim().startsWith('{') || val.trim().startsWith('[')) { try { val = JSON.parse(val.trim()); } catch(e) {} }
                  else if (!isNaN(Number(val)) && val.trim() !== '') val = Number(val);
                  else val = val.replace(/\\n/g, '\n');
                }
                const numCols = ['hp', 'maxHp', 'attack', 'range', 'minRange', 'maxRange', 'speed', 'cooldown', 'count', 'size', 'maxDeck', 'healPower', 'extraTargets'];
                if (numCols.includes(colName) && typeof val !== 'number') return; 
                if (colName === 'cost' && typeof val !== 'number' && val !== 'dynamic') return;
                if (colName === 'color' && typeof val === 'string' && !val.includes('bg-')) return; 
                cardData[colName] = val;
              });
              
              if (cardData.maxRange === undefined && cardData.range !== undefined) {
                  cardData.maxRange = cardData.range;
              }
              if (cardData.minRange === undefined) {
                  cardData.minRange = 0;
              }
              
              if (cardData.id) newCardDB[cardData.id] = { ...CardDatabase[cardData.id], ...cardData };
            });
            if (Object.keys(newCardDB).length > 0) { CardDatabase = newCardDB; }
          }
        } catch(err) { console.warn("⚠️ Cards 讀取失敗", err); }

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_STAGE}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newStage = {};
            data.forEach(row => {
              const id = Number(row.Stage_ID || row.id);
              if (id) {
                newStage[id] = {
                  id: id,
                  name: row.Stage_Name || row.name || `Stage ${id}`,
                  baseHp: Number(row.Base_MaxHP || row.baseHp) || 1000,
                  enemyBaseHp: Number(row.Enemy_MaxHP || row.enemyBaseHp) || Number(row.Base_MaxHP || row.baseHp) || 2000,
                  rewardGold: Number(row.Reward_Gold || row.rewardGold) || 50,
                  clearTime: Number(row.Clear_Time || row.clearTime) || 60,
                  bonusGold: Number(row.Bonus_Gold || row.bonusGold) || 0,
                  bonusMaxTime: Number(row.Bonus_Max_Time || row.bonusMaxTime) || 0,
                  bonusPenaltyInterval: Number(row.Bonus_Penalty_Interval || row.bonusPenaltyInterval) || 1,
                  bonusPenaltyAmount: Number(row.Bonus_Penalty_Amount || row.bonusPenaltyAmount) || 0,
                  distance: Number(row.Distance || row.distance) || 1140 
                };
              }
            });
            if (Object.keys(newStage).length > 0) { StageConfig = newStage; }
          }
        } catch(err) { console.warn("⚠️ Stage_Config 讀取失敗", err); }

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_TIMELINE}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newTimeline = [];
            data.forEach(row => {
              if (row.Stage_ID || row.stageId) {
                let dpReward = 1;
                if (row.DP_Reward !== undefined && row.DP_Reward !== '') dpReward = Number(row.DP_Reward);
                else if (row.dpReward !== undefined && row.dpReward !== '') dpReward = Number(row.dpReward);
                
                newTimeline.push({
                  stageId: Number(row.Stage_ID || row.stageId),
                  time: Number(row.Trigger_Time || row.time),
                  enemyId: (row.Enemy_ID || row.enemyId || '').trim(),
                  count: Number(row.Spawn_Count || row.count) || 1,
                  interval: Number(row.Spawn_Interval || row.interval) || 0,
                  lane: Number(row.Spawn_Lane || row.lane) || 0,
                  dpReward: dpReward
                });
              }
            });
            if (newTimeline.length > 0) { SpawnTimeline = newTimeline; }
          }
        } catch(err) { console.warn("⚠️ Spawn_Timeline 讀取失敗", err); }

        try {
          const res = await fetch(`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${GID_SHOP}`);
          if (res.ok) {
            const data = parseCSV(await res.text());
            let newShop = {};
            data.forEach(row => {
              const id = (row.Card_ID || row.id || '').trim();
              if (id) {
                newShop[id] = {
                  id: id,
                  tier: Number(row.Tier || row.tier) || 1,
                  basePrice: Number(row.Base_Price || row.basePrice) || 20,
                  upPrice: Number(row.Upgrade_Price || row.upPrice) || 30,
                  w1: Number(row.Weight_Stage1 || row.w1) || 0,
                  w2: Number(row.Weight_Stage2 || row.w2) || 0
                };
              }
            });
            if (Object.keys(newShop).length > 0) { ShopConfig = newShop; }
          }
        } catch(err) { console.warn("⚠️ Shop_Config 讀取失敗", err); }

      } catch (error) {
        console.error("❌ Google Sheet 連線總體失敗", error);
      } finally {
        setPlayerDeck(GameConfig.initialDeck.map((id, idx) => ({ uniqueId: `pid_${idx}`, baseId: id, upgraded: false })));
        setIsDataLoaded(true); 
      }
    };
    fetchGoogleSheetData();
  }, []);

  // ============================================================================
  // 🎮 遊戲核心控制 (Game Flow)
  // ============================================================================

  const startStage = () => {
    const stageConfig = StageConfig[currentStageId];
    if (!stageConfig) return;

    const battleDeck = playerDeck.map(pCard => {
      const baseData = getDeckCardInfo(pCard);
      if(!baseData) return null;
      return {
        ...baseData,
        instanceId: generateCardInstanceId(),
        isUpgraded: pCard.upgraded,
        name: pCard.upgraded ? `${baseData.name}+` : baseData.name,
        fusedAffixes: pCard.fusedAffixes || undefined,
        isPreArmed: !!pCard.fusedAffixes,
        isToken: false, 
        originalEntity: pCard.fusedAffixes ? { ...getDeckCardInfo({baseId: pCard.baseId, isElite: pCard.isElite}), isUpgraded: pCard.upgraded, isToken: false } : undefined
      };
    }).filter(Boolean);

    const actualMaxPlayerHp = stageConfig.baseHp + playerBaseHpBonus;
    const actualMaxDp = (GameConfig.constants.INITIAL_MAX_DP || 5) + playerMaxDpBonus;
    const initialDp = GameConfig.constants.INITIAL_DP !== undefined ? GameConfig.constants.INITIAL_DP : 0;
    const dpRegenBaseInterval = GameConfig.constants.DP_REGEN_BASE_INTERVAL || 2;
    const enemyHp = stageConfig.enemyBaseHp || 2000;

    const distance = stageConfig.distance || 1140;
    const dynamicEnemyBaseX = GameConfig.constants.PLAYER_BASE_X + distance;
    const dynamicBattlefieldWidth = dynamicEnemyBaseX + 180; 

    engine.current = {
      ...engine.current,
      status: 'playing', 
      dp: initialDp, 
      dpMax: actualMaxDp, 
      dpRegenBaseInterval: dpRegenBaseInterval,
      playerBaseHp: actualMaxPlayerHp, 
      maxPlayerBaseHp: actualMaxPlayerHp,
      enemyBaseHp: enemyHp, maxEnemyBaseHp: enemyHp,
      enemyBaseX: dynamicEnemyBaseX,             
      battlefieldWidth: dynamicBattlefieldWidth, 
      deck: shuffleArray([...battleDeck]), 
      hand: [], deployed: [], discard: [], units: [], effects: [], droppedItems: [],
      timers: { draw: 0, shuffle: 0, upgradeTimer: 0 }, 
      flags: { isShuffling: false, isPaused: false, isWaitingForUpgradeUse: false, stageCleared: false, timeoutBossSpawned: false }, 
      waveTime: -5, 
      pendingSpawns: [], timelineTriggered: new Set(), clearTime: stageConfig.clearTime || 120,
      earnedBaseGold: 0, earnedBonusGold: 0
    };
    
    setDragState({ isDragging: false, category: null, hover: null, id: null });
    setSelectedAffixId(null); setInspectingCard(null);
    for(let i=0; i<5; i++) drawCard();
    setTick(t => t + 1);
  };

  const endStageWin = (bonusGold = 0) => {
    const stageConfig = StageConfig[currentStageId];
    const baseGold = stageConfig?.rewardGold || 50;
    setGold(prev => prev + baseGold + bonusGold);
    engine.current.earnedBaseGold = baseGold;
    engine.current.earnedBonusGold = bonusGold;
    engine.current.status = 'stage_clear';
    setTick(t => t + 1);
  };

  // 🌟 修改：傳入 targetStageId 確保生成卡池正確對應目標關卡
  const generateShopCards = (targetStageId) => {
    const sid = targetStageId !== undefined ? targetStageId : currentStageId;
    const weightKey = `w${sid}`;
    const pool = [];
    Object.values(ShopConfig).forEach(item => {
      const weight = item[weightKey] || 0;
      for (let i = 0; i < weight; i++) pool.push(item.id);
    });
    
    const offered = [];
    for(let i=0; i<3; i++) {
      if(pool.length > 0) {
        const randIdx = Math.floor(Math.random() * pool.length);
        offered.push(CardDatabase[pool[randIdx]]);
      } else {
        offered.push(null);
      }
    }
    setShopCards(offered);
  };

  // 🌟 修改：接收 nextStageId 並重置商店相關設定
  const enterShop = (targetStageId) => {
    generateShopCards(targetStageId);
    setHasUpgradedCastle(false); 
    setRerollCost(GameConfig.constants.REROLL_BASE_COST || 10); 
    engine.current.status = 'shop';
    setTick(t => t + 1);
  };

  const drawCard = () => {
    const state = engine.current;
    if (state.hand.length >= 5) return false;
    if (state.deck.length > 0) { 
      state.hand.push({ ...state.deck.pop(), instanceId: generateCardInstanceId() }); 
      return true; 
    }
    return false;
  };

  const spawnUnit = (actualCard, spawnX, spawnedUnitIds) => {
    const unitId = generateId();
    if(spawnedUnitIds) spawnedUnitIds.push(unitId);
    
    let finalHp = actualCard.hp, finalMaxHp = actualCard.maxHp, finalAttack = actualCard.attack;
    let finalSpeed = actualCard.speed, finalCooldown = actualCard.cooldown;
    let finalSize = actualCard.size || 1;
    let hasBurn = actualCard.mechanic === 'burn' || false;
    
    let finalMinRange = actualCard.minRange || 0;
    let finalMaxRange = actualCard.maxRange !== undefined ? actualCard.maxRange : (actualCard.range || 0);

    if (actualCard.isUpgraded) {
        finalHp = Math.floor(finalHp * 1.2); finalMaxHp = Math.floor(finalMaxHp * 1.2); finalAttack = Math.floor(finalAttack * 1.2);
    }
    let hasGigantification = false; let affixColors = [];

    if (actualCard.fusedAffixes) {
      actualCard.fusedAffixes.forEach(affix => {
        if (affix.buff) {
          if (affix.buff.attack) finalAttack += affix.buff.attack;
          if (affix.buff.speed) finalSpeed += affix.buff.speed;
          if (affix.buff.hp) { finalMaxHp += affix.buff.hp; finalHp += affix.buff.hp; }
          if (affix.buff.range) finalMaxRange += affix.buff.range;
          if (affix.buff.maxRange) finalMaxRange += affix.buff.maxRange;
          if (affix.buff.hpMult) { finalMaxHp = Math.floor(finalMaxHp * affix.buff.hpMult); finalHp = Math.floor(finalHp * affix.buff.hpMult); }
          if (affix.buff.cooldownMult) finalCooldown *= affix.buff.cooldownMult;
          if (affix.buff.size) finalSize += affix.buff.size;
        }
        if (affix.mechanic === 'burn') hasBurn = true;
        if (affix.id === 'gigantification') hasGigantification = true;
        if (affix.color) affixColors.push(affix.color);
      });
    }

    engine.current.units.push({
      ...actualCard, id: unitId, baseId: actualCard.id, owner: 'player', x: spawnX, 
      lastAttack: 999, 
      cardInstanceId: actualCard.instanceId,
      hasBurn, burns: [], hasGigantification, affixColors, size: finalSize, hasFirstStrikeKnockback: actualCard.hasFirstStrikeKnockback || false, firstStrikeUsed: false,
      hp: finalHp, maxHp: finalMaxHp, attack: finalAttack, speed: finalSpeed, minRange: finalMinRange, maxRange: finalMaxRange, cooldown: finalCooldown,
      attackAnimTimer: 0
    });
  };

  const executeCardPlay = (cardInstanceId) => {
    const state = engine.current;
    const actualCard = state.hand.find(c => c.instanceId === cardInstanceId);
    if (!actualCard) return;
    if (actualCard.category === 'affix') { setSelectedAffixId(prev => prev === cardInstanceId ? null : cardInstanceId); return; }

    if (state.dp < actualCard.cost) return;

    if (actualCard.category === 'entity') {
      state.dp -= actualCard.cost;
      state.hand = state.hand.filter(c => c.instanceId !== actualCard.instanceId);
      setSelectedAffixId(null); 

      const spawnedUnitIds = [];
      for (let i = 0; i < actualCard.count; i++) spawnUnit(actualCard, GameConfig.constants.PLAYER_BASE_X - 50 - (i * 30), spawnedUnitIds);
      state.deployed.push({ deployedId: generateDeployedId(), instanceId: actualCard.instanceId, cardData: { ...actualCard }, unitIds: spawnedUnitIds, affixes: [...(actualCard.fusedAffixes || [])] });
      setTick(t => t + 1);
    } 
  };

  const executeSpellEmptyCast = (affixCard, worldX) => {
    const state = engine.current;
    if (state.dp < affixCard.cost) return;
    state.dp -= affixCard.cost;
    state.hand = state.hand.filter(c => c.instanceId !== affixCard.instanceId);
    setSelectedAffixId(null);

    if (affixCard.id === 'rage_potion') {
      state.effects.push({ id: generateEffectId(), type: 'haste_array', x: worldX, width: 200, duration: 3 });
    } else if (affixCard.id === 'stone_armor') {
      state.units.push({ ...CardDatabase.monolith, id: generateId(), baseId: 'monolith', owner: 'player', x: worldX, lastAttack: 999, lifetime: 5, burns: [] });
    } else if (affixCard.id === 'fire_enchant') {
      state.effects.push({ id: generateEffectId(), type: 'fire_burst', x: worldX, width: 150, duration: 0.5 });
      state.units.forEach(u => { if (u.owner === 'enemy' && Math.abs(u.x - worldX) <= 75) { u.hp -= 20; u.burns.push({ duration: 3, dps: 15 }); } });
    } else if (affixCard.id === 'gigantification') {
      state.effects.push({ id: generateEffectId(), type: 'gravity_slow', x: worldX, width: 250, duration: 0.5 });
      state.units.forEach(u => { if (u.owner === 'enemy' && Math.abs(u.x - worldX) <= 125) { u.x = Math.min(state.enemyBaseX, u.x + 30); u.slowTimer = 3; } });
    }

    state.discard.push({ ...affixCard, instanceId: undefined });
    setTick(t => t + 1);
  };

  const applyAffixToDeployed = (affixInstanceId, deployedId) => {
    const state = engine.current;
    const affixCard = state.hand.find(c => c.instanceId === affixInstanceId);
    const deployedCard = state.deployed.find(dep => dep.deployedId === deployedId);

    if (!affixCard || !deployedCard || state.dp < affixCard.cost || deployedCard.affixes.length >= 2) return;

    state.dp -= affixCard.cost;
    state.hand = state.hand.filter(c => c.instanceId !== affixInstanceId);
    setSelectedAffixId(null); 
    
    deployedCard.affixes.push({ ...affixCard, instanceId: undefined });

    state.units.forEach(unit => {
      if (deployedCard.unitIds.includes(unit.id)) {
        if (affixCard.buff) {
          if (affixCard.buff.attack) unit.attack += affixCard.buff.attack;
          if (affixCard.buff.speed) unit.speed += affixCard.buff.speed;
          if (affixCard.buff.range || affixCard.buff.maxRange) unit.maxRange += (affixCard.buff.range || affixCard.buff.maxRange);
          if (affixCard.buff.hpMult) { const newMax = Math.floor(unit.maxHp * affixCard.buff.hpMult); unit.maxHp = newMax; unit.hp = Math.min(unit.hp, newMax); }
          if (affixCard.buff.hp) { unit.maxHp += affixCard.buff.hp; unit.hp += affixCard.buff.hp; }
          if (affixCard.buff.cooldownMult) unit.cooldown *= affixCard.buff.cooldownMult;
          if (affixCard.buff.size) unit.size += affixCard.buff.size;
        }
        if (affixCard.mechanic === 'burn') unit.hasBurn = true;
        if (affixCard.id === 'gigantification') unit.hasGigantification = true;
        if (affixCard.color) { unit.affixColors = unit.affixColors || []; unit.affixColors.push(affixCard.color); }
      }
    });
    setTick(t => t + 1);
  };

  const handleDeployedClick = (deployedId) => {
    if (selectedAffixId) applyAffixToDeployed(selectedAffixId, deployedId);
    else { const dep = engine.current.deployed.find(d => d.deployedId === deployedId); if (dep) setInspectingCard(dep.cardData); }
  };

  const fuseCards = (sourceId, targetId) => {
    const state = engine.current;
    const sourceCard = state.hand.find(c => c.instanceId === sourceId);
    const targetCard = state.hand.find(c => c.instanceId === targetId);
    if (!sourceCard || !targetCard) return;

    const newCard = getFusionResultCard(sourceCard, targetCard);
    if (!newCard) { state.hand.push(sourceCard, targetCard); return; } 

    state.hand = state.hand.filter(c => c.instanceId !== sourceId && c.instanceId !== targetId);
    setSelectedAffixId(null);
    newCard.instanceId = generateCardInstanceId();

    state.hand.push(newCard); 
    
    if (sourceCard.category === 'entity' && targetCard.category === 'entity') {
      const unlockKey = newCard.name;
      if (!unlockedSet.current.has(unlockKey)) {
        unlockedSet.current.add(unlockKey);
        const toastId = Date.now() + Math.random();
        setUnlockNotifications(prev => [...prev, { id: toastId, name: newCard.name, color: newCard.color, baseId: newCard.baseId || newCard.id }]);
        setTimeout(() => { setUnlockNotifications(prev => prev.filter(t => t.id !== toastId)); }, 4000); 
      }
    }
    setTick(t => t + 1); 
  };

  const handlePointerDown = (e, cardInstanceId) => {
    if (e.button !== 0 && e.button !== undefined) return;
    e.preventDefault();

    const state = engine.current;
    const actualCard = state.hand.find(c => c.instanceId === cardInstanceId);
    if (!actualCard) return;

    const el = e.currentTarget;
    dragRef.current = { id: cardInstanceId, el: el, startX: e.clientX, startY: e.clientY, isDragging: false, isLongPressing: false, longPressTimer: null };
    el.style.transition = 'none'; el.style.zIndex = '100';

    let currentHoverStr = null;
    setDragState({ isDragging: true, category: actualCard.category, hover: null, id: cardInstanceId });

    dragRef.current.longPressTimer = setTimeout(() => {
        dragRef.current.isLongPressing = true;
        if (dragRef.current.el) { dragRef.current.el.style.transform = ''; dragRef.current.el.style.zIndex = ''; dragRef.current.el.classList.remove('scale-110', 'shadow-2xl', 'opacity-95'); }
        setInspectingCard(actualCard); engine.current.flags.isPaused = true;
        setDragState({ isDragging: false, category: null, hover: null, id: null });
    }, 400);

    const handlePointerMove = (moveEvent) => {
      if (dragRef.current.isLongPressing) return;
      const { startX, startY, isDragging } = dragRef.current;
      const dx = moveEvent.clientX - startX; const dy = moveEvent.clientY - startY;

      if (!isDragging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        clearTimeout(dragRef.current.longPressTimer);
        dragRef.current.isDragging = true; el.style.pointerEvents = 'none'; el.classList.add('scale-110', 'shadow-2xl', 'opacity-95');
      }

      if (dragRef.current.isDragging) {
        el.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
        el.style.visibility = 'hidden';
        const elemUnder = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        el.style.visibility = 'visible'; 

        let hoverTarget = null;
        if (elemUnder) {
          const handCard = elemUnder.closest('.hand-card-droppable');
          const depUnit = elemUnder.closest('.deployed-unit-droppable');
          const depZone = elemUnder.closest('.deployment-zone-droppable');
          const battlefieldZone = elemUnder.closest('.battlefield-zone');

          if (handCard) hoverTarget = { type: 'fuse', id: handCard.getAttribute('data-instance-id') };
          else if (depUnit && actualCard.category === 'affix') hoverTarget = { type: 'buff', id: depUnit.getAttribute('data-deployed-id') };
          else if (battlefieldZone && actualCard.category === 'affix') {
             const rect = battlefieldZone.getBoundingClientRect();
             const scrollLeft = battlefieldRef.current ? battlefieldRef.current.scrollLeft : 0;
             let worldX = moveEvent.clientX - rect.left + scrollLeft;
             worldX = Math.max(GameConfig.constants.PLAYER_BASE_X, Math.min(state.enemyBaseX, worldX));
             hoverTarget = { type: 'spell_empty', x: worldX };
          }
          else if ((depZone || battlefieldZone) && actualCard.category !== 'affix') hoverTarget = { type: 'deploy' };
        }

        const newHoverStr = JSON.stringify(hoverTarget);
        if (newHoverStr !== currentHoverStr) {
          currentHoverStr = newHoverStr;
          setDragState({ isDragging: true, category: actualCard.category, hover: hoverTarget, id: cardInstanceId });
        }
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove); document.removeEventListener('pointerup', handlePointerUp); document.removeEventListener('pointercancel', handlePointerUp);
      clearTimeout(dragRef.current.longPressTimer);

      if (dragRef.current.isLongPressing) {
          setInspectingCard(null); engine.current.flags.isPaused = false;
          dragRef.current = { id: null, el: null, startX: 0, startY: 0, isDragging: false, isLongPressing: false, longPressTimer: null };
          return;
      }

      const { id, isDragging } = dragRef.current;
      const hoverParsed = currentHoverStr ? JSON.parse(currentHoverStr) : null;
      if (el) { el.style.transition = ''; el.style.transform = ''; el.style.zIndex = ''; el.style.pointerEvents = ''; el.classList.remove('scale-110', 'shadow-2xl', 'opacity-95'); }

      const actualCard = state.hand.find(c => c.instanceId === id);

      if (isDragging) {
        if (hoverParsed) {
          if (hoverParsed.type === 'fuse' && hoverParsed.id !== id) fuseCards(id, hoverParsed.id);
          else if (hoverParsed.type === 'buff' && actualCard.category === 'affix') applyAffixToDeployed(id, hoverParsed.id);
          else if (hoverParsed.type === 'spell_empty' && actualCard.category === 'affix') executeSpellEmptyCast(actualCard, hoverParsed.x);
          else if (hoverParsed.type === 'deploy' && actualCard.category !== 'affix') executeCardPlay(id);
        } else {
          const inHandZone = dragState.hover?.type === 'fuse' || dragRef.current.el?.getBoundingClientRect().bottom > window.innerHeight - 150;
          if (!inHandZone && actualCard && actualCard.category !== 'affix') executeCardPlay(id);
        }
      } else {
        if (actualCard && actualCard.category === 'affix') setSelectedAffixId(prev => prev === id ? null : id);
      }

      setDragState({ isDragging: false, category: null, hover: null, id: null });
      dragRef.current = { id: null, el: null, startX: 0, startY: 0, isDragging: false, isLongPressing: false, longPressTimer: null };
    };

    document.addEventListener('pointermove', handlePointerMove); document.addEventListener('pointerup', handlePointerUp); document.addEventListener('pointercancel', handlePointerUp);
  };

  const handleDeckCardDown = (card, e) => {
    if (e.button !== 0 && e.button !== undefined) return;
    let isFired = false;
    const startY = e.clientY, startX = e.clientX;
    const timer = setTimeout(() => { isFired = true; setInspectingCard(card); }, 400);

    const handleMove = (me) => { if (Math.abs(me.clientY - startY) > 10 || Math.abs(me.clientX - startX) > 10) clearTimeout(timer); };
    const handleUp = () => { clearTimeout(timer); if (isFired) setInspectingCard(null); document.removeEventListener('pointermove', handleMove); document.removeEventListener('pointerup', handleUp); document.removeEventListener('pointercancel', handleUp); };
    
    document.addEventListener('pointermove', handleMove); document.addEventListener('pointerup', handleUp); document.addEventListener('pointercancel', handleUp);
  };

  // --- Game Loop ---
  useEffect(() => {
    let lastTime = performance.now();
    let animationFrameId;

    const gameLoop = (currentTime) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      const state = engine.current;

      if (state.status === 'playing' && !state.flags.isPaused) {
        state.waveTime += dt;
        const dpInterval = state.dpRegenBaseInterval; 
        
        if (state.dp < state.dpMax) {
            state.dpRegenTimer += dt;
            if (state.dpRegenTimer >= dpInterval) {
                state.dp = Math.min(state.dp + 1, state.dpMax); 
                state.dpRegenTimer = 0; 
            }
        } else {
            state.dpRegenTimer = dpInterval;
        }

        if (state.flags.isShuffling) {
          state.timers.shuffle += dt;
          if (state.timers.shuffle >= 5) {
            state.flags.isShuffling = false; state.deck = shuffleArray([...state.discard]); state.discard = []; state.timers.shuffle = 0;
          }
        } else {
          if (state.hand.length < 5) {
            if (state.deck.length > 0) {
              state.timers.draw += dt;
              if (state.timers.draw >= 1) { drawCard(); state.timers.draw = 0; } 
            } else if (state.discard.length > 0 && !state.flags.isShuffling) {
              state.flags.isShuffling = true; state.timers.shuffle = 0;
            }
          }
        }

        if (state.waveTime >= 0 && state.waveTime < state.clearTime) {
          SpawnTimeline.forEach((event, idx) => {
            if (event.stageId === currentStageId && state.waveTime >= event.time && !state.timelineTriggered.has(idx)) {
               state.timelineTriggered.add(idx);
               state.pendingSpawns.push({ enemyId: event.enemyId, count: event.count, interval: event.interval, timer: event.interval, dpReward: event.dpReward });
            }
          });
        }

        state.pendingSpawns = state.pendingSpawns.filter(spawn => {
            if (spawn.count > 0) {
               spawn.timer += dt;
               if (spawn.timer >= spawn.interval) {
                  spawn.timer = 0;
                  spawn.count -= 1;
                  const baseEnemy = CardDatabase[spawn.enemyId];
                  if (baseEnemy) {
                      state.units.push({
                        ...baseEnemy, id: generateId(), baseId: spawn.enemyId, owner: 'enemy',
                        x: state.enemyBaseX + 50, lastAttack: 999, attackAnimTimer: 0,
                        hp: baseEnemy.hp, maxHp: baseEnemy.maxHp, attack: baseEnemy.attack,
                        size: baseEnemy.size || 1, hasFirstStrikeKnockback: baseEnemy.hasFirstStrikeKnockback || false, firstStrikeUsed: false,
                        burns: [], minRange: baseEnemy.minRange || 0, maxRange: baseEnemy.maxRange !== undefined ? baseEnemy.maxRange : (baseEnemy.range || 0), cooldown: baseEnemy.cooldown,
                        dpReward: spawn.dpReward 
                      });
                  }
               }
            }
            return spawn.count > 0;
        });

        if (state.enemyBaseHp <= 0 && !state.flags.stageCleared) {
            state.flags.stageCleared = true;
            let bonusGold = 0;
            const stageCfg = StageConfig[currentStageId];
            
            if (stageCfg && stageCfg.bonusGold > 0) {
                if (state.waveTime <= stageCfg.bonusMaxTime) {
                    bonusGold = stageCfg.bonusGold;
                } else {
                    const extraTime = state.waveTime - stageCfg.bonusMaxTime;
                    const penaltySteps = Math.floor(extraTime / stageCfg.bonusPenaltyInterval);
                    bonusGold = Math.max(0, stageCfg.bonusGold - (penaltySteps * stageCfg.bonusPenaltyAmount));
                }
            }
            endStageWin(bonusGold);
            
        } else if (state.waveTime >= state.clearTime && !state.flags.timeoutBossSpawned && !state.flags.stageCleared) {
            state.flags.timeoutBossSpawned = true;
            state.units.push({
                id: generateId(), baseId: 'boss_orc', owner: 'enemy', name: '末日裁決者',
                x: state.enemyBaseX + 50, lastAttack: 999, attackAnimTimer: 0,
                hp: 99999, maxHp: 99999, attack: 9999, speed: 100, minRange: 0, maxRange: 80, cooldown: 0.5,
                size: 5, hasFirstStrikeKnockback: true, firstStrikeUsed: false,
                burns: [], isToken: true 
            });
            state.effects.push({ id: generateEffectId(), type: 'gold_float', text: '末日降臨！', x: state.enemyBaseX - 100, duration: 4 });
        } else if (state.playerBaseHp <= 0 && !state.flags.stageCleared) {
            state.flags.stageCleared = true;
            state.status = 'gameover';
        }

        state.effects = state.effects.filter(eff => {
          eff.duration -= dt;
          if (eff.type === 'haste_array') { state.units.forEach(u => { if (u.owner === 'player' && Math.abs(u.x - eff.x) <= eff.width/2) u.hasteAuraTimer = 0.5; }); }
          return eff.duration > 0;
        });

        const currentUnits = [...state.units];
        currentUnits.forEach(unit => {
          if (unit.hp <= 0) return; 

          if (unit.lifetime !== undefined) { unit.lifetime -= dt; if(unit.lifetime <= 0) unit.hp = 0; }
          if (unit.isAbomination) unit.hp -= 30 * dt;
          if (unit.slowTimer !== undefined && unit.slowTimer > 0) unit.slowTimer -= dt;
          if (unit.hasteAuraTimer !== undefined && unit.hasteAuraTimer > 0) unit.hasteAuraTimer -= dt;
          if (unit.attackAnimTimer > 0) unit.attackAnimTimer -= dt; 
          
          if (unit.burns && unit.burns.length > 0) {
            unit.burns = unit.burns.filter(b => { b.duration -= dt; unit.hp -= b.dps * dt; return b.duration > 0; });
          }
          if (unit.hp <= 0) return;

          let targets = [];
          let hasAllyAhead = false;
          const direction = unit.owner === 'player' ? 1 : -1;

          if (unit.isHealer) {
             currentUnits.forEach(ally => {
               if (ally.owner === unit.owner && ally.hp > 0 && ally.id !== unit.id) {
                 const dist = Math.abs(ally.x - unit.x);
                 const isAhead = unit.owner === 'player' ? ally.x > unit.x : ally.x < unit.x;
                 if (isAhead) { 
                     hasAllyAhead = true; 
                     if (ally.hp < ally.maxHp && dist >= unit.minRange && dist <= unit.maxRange) targets.push({ type: 'unit', entity: ally, distance: dist }); 
                 }
               }
             });
          } else {
             currentUnits.forEach(enemy => {
               if (enemy.owner !== unit.owner && enemy.hp > 0) {
                 const dist = Math.abs(enemy.x - unit.x);
                 const isAhead = unit.owner === 'player' ? enemy.x > unit.x : enemy.x < unit.x;
                 if (isAhead && dist >= unit.minRange && dist <= unit.maxRange) targets.push({ type: 'unit', entity: enemy, distance: dist });
               }
             });
             if (targets.length === 0) {
                 const targetBaseX = unit.owner === 'player' ? state.enemyBaseX : GameConfig.constants.PLAYER_BASE_X;
                 const distToBase = Math.abs(targetBaseX - unit.x);
                 const isAhead = unit.owner === 'player' ? targetBaseX > unit.x : targetBaseX < unit.x;
                 if(isAhead && distToBase >= unit.minRange && distToBase <= unit.maxRange) targets.push({ type: 'base', distance: distToBase });
             }
          }

          let isAttacking = targets.length > 0;

          if (isAttacking) {
             unit.lastAttack += dt;
             if (unit.lastAttack >= unit.cooldown) {
                 unit.lastAttack = 0;
                 unit.attackAnimTimer = 0.2; 

                 if (unit.hasFirstStrikeKnockback && !unit.firstStrikeUsed) {
                     unit.firstStrikeUsed = true;
                     targets.forEach(target => {
                         if (target.type === 'unit' && (target.entity.size || 1) < unit.size) {
                             target.entity.x += direction * 80;
                             target.entity.x = Math.max(GameConfig.constants.PLAYER_BASE_X, Math.min(state.enemyBaseX, target.entity.x));
                             target.entity.slowTimer = 1; 
                         }
                     });
                 }

                 targets.forEach(target => {
                    if (unit.isHealer) {
                        if(target.type === 'unit') target.entity.hp = Math.min(target.entity.maxHp, target.entity.hp + unit.healPower);
                    } else {
                        let actualAtk = Number(unit.attack) || 0;
                        actualAtk += (unit.hasteAuraTimer > 0 ? 15 : 0);

                        if (target.type === 'unit') {
                            target.entity.hp -= actualAtk;
                            if (unit.hasBurn) target.entity.burns.push({ duration: 3, dps: actualAtk * 0.3 });
                            state.effects.push({ id: generateEffectId(), type: 'hit_spark', owner: unit.owner, x: target.entity.x + (Math.random()*20-10), yOffset: Math.random()*30, duration: 0.3 });
                        } else if (target.type === 'base') {
                            const baseX = unit.owner === 'player' ? state.enemyBaseX : GameConfig.constants.PLAYER_BASE_X;
                            if (unit.owner === 'player') state.enemyBaseHp -= actualAtk; 
                            else state.playerBaseHp -= actualAtk;
                            state.effects.push({ id: generateEffectId(), type: 'hit_spark', owner: unit.owner, x: baseX + (Math.random()*60-30), yOffset: 10 + Math.random()*50, duration: 0.3 });
                        }
                    }
                 });
             }
          }

          if (!isAttacking) {
              let actualSpeed = unit.speed;
              if (unit.slowTimer > 0) actualSpeed *= 0.3;
              if (unit.hasteAuraTimer > 0) actualSpeed += 20;
              if (unit.isHealer && !hasAllyAhead) actualSpeed = 0;

              unit.x += direction * actualSpeed * dt;
              if (unit.owner === 'player' && unit.x > state.enemyBaseX) unit.x = state.enemyBaseX;
              if (unit.owner === 'enemy' && unit.x < GameConfig.constants.PLAYER_BASE_X) unit.x = GameConfig.constants.PLAYER_BASE_X;
          }
        });

        const deadUnitIds = new Set();
        state.units = currentUnits.filter(unit => {
            if (unit.hp > 0) return true;
            deadUnitIds.add(unit.id);
            
            if (unit.owner === 'enemy' && !unit.isToken) {
                const dpGain = unit.dpReward !== undefined ? unit.dpReward : 1;
                state.dp = Math.min(state.dp + dpGain, state.dpMax); 
                setGold(g => g + 5);
                
                state.effects.push({ id: generateEffectId(), type: 'float_text', text: '+5 G', color: 'text-yellow-400', x: unit.x, yOffset: 30, duration: 1.5 });
                if (dpGain > 0) {
                    state.effects.push({ id: generateEffectId(), type: 'float_text', text: `+${dpGain} DP`, color: 'text-blue-300', x: unit.x, yOffset: 45, duration: 1.5 });
                }
            }
            return false;
        });

        if (deadUnitIds.size > 0) {
            let newDiscard = [...state.discard];
            state.deployed = state.deployed.filter(depCard => {
                depCard.unitIds = depCard.unitIds.filter(id => !deadUnitIds.has(id));
                if (depCard.unitIds.length === 0) {
                    const { instanceId, deployedId, ...originalEntityCard } = depCard.cardData; 
                    if (originalEntityCard.fusionMaterials) {
                        originalEntityCard.fusionMaterials.forEach(mat => { if (!mat.isToken) newDiscard.push(mat); });
                    } else if (originalEntityCard.isPreArmed) {
                        newDiscard.push(originalEntityCard.originalEntity); 
                    } else if (!originalEntityCard.isToken) {
                        newDiscard.push(originalEntityCard); 
                    }
                    depCard.affixes.forEach(affixCard => { if(!affixCard.isToken) newDiscard.push(affixCard); });
                    return false; 
                }
                return true;
            });
            state.discard = newDiscard;
        }

        setTick(t => t + 1);
      }
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [currentStageId]);

  const state = engine.current;

  // --- 全域提示元件渲染 ---
  const renderGlobalNotifications = () => (
    <div className="fixed top-24 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
      {unlockNotifications.map(toast => (
        <div key={`toast-${toast.id}`} className="flex items-center bg-slate-900/95 border-2 border-yellow-400 rounded-xl px-4 py-2 shadow-[0_0_20px_rgba(250,204,21,0.6)] animate-unlock-toast">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 border border-white/30 ${toast.color || 'bg-yellow-500'}`}>
             <CssIcon id={toast.baseId} className="w-5 h-5 text-white" />
          </div>
          <div>
             <div className="text-[10px] text-yellow-400 font-bold tracking-widest">NEW SPECIES</div>
             <div className="text-sm font-black text-white">解鎖：{toast.name}</div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!isDataLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-white font-sans">
        <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-black text-green-400 mb-2">正在連接系統伺服器...</h2>
        <p className="text-slate-400 text-sm font-bold tracking-widest text-center">
          同步遠端參數表 <br/> ID: 13MsIajwr8ANbhCx6EdyMvJmmGLKpB1JuEPqnZVYTeBc
        </p>
      </div>
    );
  }

  const handleMapPointerDown = (e) => {
    if (dragState.isDragging || !battlefieldRef.current || e.pointerType !== 'mouse') return;
    mapScrollRef.current.isDown = true;
    mapScrollRef.current.startX = e.clientX - battlefieldRef.current.offsetLeft;
    mapScrollRef.current.scrollLeft = battlefieldRef.current.scrollLeft;
    battlefieldRef.current.style.scrollBehavior = 'auto'; 
  };

  const handleMapPointerUp = (e) => {
    if (e.pointerType !== 'mouse') return;
    mapScrollRef.current.isDown = false;
    if(battlefieldRef.current) battlefieldRef.current.style.scrollBehavior = 'smooth';
  };

  const handleMapPointerMove = (e) => {
    if (!mapScrollRef.current.isDown || !battlefieldRef.current || e.pointerType !== 'mouse') return;
    e.preventDefault();
    const x = e.clientX - battlefieldRef.current.offsetLeft;
    const walk = (x - mapScrollRef.current.startX) * 1.5; 
    battlefieldRef.current.scrollLeft = mapScrollRef.current.scrollLeft - walk;
  };

  const getDeployedFrontX = (dep) => {
    let maxX = -Infinity;
    dep.unitIds.forEach(id => {
      const u = state.units.find(unit => unit.id === id);
      if (u && u.hp > 0) { maxX = Math.max(maxX, u.x); }
    });
    return maxX === -Infinity ? 999999 : maxX; 
  };
  const sortedDeployed = [...state.deployed].sort((a, b) => getDeployedFrontX(a) - getDeployedFrontX(b));

  const InspectModal = () => {
    if (!inspectingCard) return null;
    let displaySize = inspectingCard.size || 1;
    if (inspectingCard.isElite) displaySize += 1;
    if (inspectingCard.fusedAffixes) inspectingCard.fusedAffixes.forEach(afx => { if (afx.buff && afx.buff.size) displaySize += afx.buff.size; });

    const handleClose = (e) => {
      if (e) {
          e.stopPropagation();
          e.preventDefault();
      }
      if (inspectingCard.isFusionResult) {
          setSelectedCardsToFuse([]);
          engine.current.status = 'shop';
          setTick(t=>t+1);
      }
      setInspectingCard(null);
    };

    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md transition-all duration-200" onClick={handleClose}>
        <div className="bg-slate-900 border-2 border-slate-600 rounded-2xl w-[85%] max-w-sm max-h-[85vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden pointer-events-auto relative" onClick={e=>e.stopPropagation()}>
          <div className={`${inspectingCard.color || 'bg-slate-700'} p-4 flex items-center shrink-0`}>
            <div className="absolute top-4 right-4 w-8 h-8 bg-yellow-500 rounded-full border-2 border-yellow-200 flex items-center justify-center font-black text-slate-900 shadow-lg">
              {inspectingCard.cost === 'dynamic' ? 'X' : inspectingCard.cost}
            </div>
            <CssIcon id={inspectingCard.baseId || inspectingCard.id} className="w-12 h-12 text-white opacity-90 mr-3 drop-shadow-md" />
            <div>
              <h3 className="text-xl font-black text-white leading-tight">{inspectingCard.name}</h3>
              <p className="text-xs text-white/80 font-bold mt-0.5">
                {inspectingCard.isElite ? '精英首領' : inspectingCard.isAbomination ? '崩壞產物' : inspectingCard.category === 'entity' ? '實體單位' : inspectingCard.category === 'affix' ? '強化魔咒' : '禁忌法術'}
              </p>
            </div>
          </div>
          <div className="p-4 bg-slate-800 grid grid-cols-2 gap-2 border-b border-slate-700 text-sm shrink-0">
            {inspectingCard.hp && <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">生命</span> <span className="text-green-400 font-bold">{inspectingCard.hp}</span></div>}
            {inspectingCard.attack !== undefined && <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">攻擊</span> <span className="text-red-400 font-bold">{inspectingCard.attack}</span></div>}
            {inspectingCard.healPower !== undefined && <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">治療力</span> <span className="text-emerald-400 font-bold">{inspectingCard.healPower}</span></div>}
            {inspectingCard.speed !== undefined && <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">跑速</span> <span className="text-blue-400 font-bold">{inspectingCard.speed}</span></div>}
            {(inspectingCard.maxRange !== undefined || inspectingCard.range !== undefined) && (
               <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner">
                  <span className="text-slate-400">射程</span> 
                  <span className="text-purple-400 font-bold">
                     {inspectingCard.minRange || 0} ~ {inspectingCard.maxRange !== undefined ? inspectingCard.maxRange : inspectingCard.range}
                  </span>
               </div>
            )}
            {inspectingCard.cooldown !== undefined && <div className="flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">攻速</span> <span className="text-yellow-400 font-bold">{inspectingCard.cooldown}s</span></div>}
            {inspectingCard.category === 'entity' && <div className="col-span-2 flex justify-between bg-slate-900 p-2 rounded shadow-inner"><span className="text-slate-400">體型大小</span> <span className="text-pink-400 font-bold">{displaySize}</span></div>}

            {inspectingCard.buff && (
               <div className="col-span-2 flex flex-wrap gap-2 mt-1">
                 {inspectingCard.buff.hp && <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded text-xs border border-green-700">給予目標: 生命 +{inspectingCard.buff.hp}</span>}
                 {inspectingCard.buff.hpMult && <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs border border-red-700">代價: 生命值降低</span>}
                 {inspectingCard.buff.attack && <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs border border-red-700">給予目標: 攻擊 +{inspectingCard.buff.attack}</span>}
                 {inspectingCard.buff.speed && <span className="bg-blue-900/50 text-blue-300 px-2 py-1 rounded text-xs border border-blue-700">給予目標: 跑速 +{inspectingCard.buff.speed}</span>}
                 {(inspectingCard.buff.range || inspectingCard.buff.maxRange) && <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs border border-purple-700">給予目標: 最大射程 +{inspectingCard.buff.range || inspectingCard.buff.maxRange}</span>}
                 {inspectingCard.buff.cooldownMult && <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded text-xs border border-yellow-700">給予目標: 大幅提升攻速</span>}
                 {inspectingCard.buff.size && <span className="bg-pink-900/50 text-pink-300 px-2 py-1 rounded text-xs border border-pink-700">給予目標: 體型 +{inspectingCard.buff.size}</span>}
               </div>
            )}
            {inspectingCard.mechanic && (
               <div className="col-span-2 bg-purple-900/50 text-purple-300 px-2 py-1.5 rounded text-xs border border-purple-700 mt-1 text-center font-bold">
                 特殊機制: {inspectingCard.mechanic === 'burn' ? '普攻附帶燃燒' : '全範圍火力覆蓋'}
               </div>
            )}
            {inspectingCard.fusedAffixes && inspectingCard.fusedAffixes.length > 0 && (
               <div className="col-span-2 border-t border-slate-700 pt-2 mt-1">
                 <span className="text-xs text-yellow-500 font-bold block mb-1">已植入魔咒：</span>
                 <div className="flex flex-col gap-1">
                   {inspectingCard.fusedAffixes.map((afx, i) => (
                     <span key={`afx-${i}`} className="text-xs text-slate-300 flex items-center bg-slate-900 p-1.5 rounded shadow-inner">
                       <CssIcon id={afx.id} className={`w-3 h-3 mr-1.5 ${afx.color} text-white rounded-full`} /> {afx.name}
                     </span>
                   ))}
                 </div>
               </div>
            )}
          </div>
          <div className="p-4 flex-1 overflow-y-auto hide-scrollbar bg-slate-900">
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{inspectingCard.desc}</p>
          </div>
          <div onClick={handleClose} className={`bg-slate-950 p-3 text-center text-xs font-bold border-t border-slate-800 shrink-0 uppercase tracking-widest animate-pulse cursor-pointer transition-colors ${inspectingCard.isFusionResult ? 'text-purple-400 hover:bg-slate-900 hover:text-purple-300' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'}`}>
            {inspectingCard.isFusionResult ? '★ 融合成功！點擊返回商店 ★' : '點擊關閉'}
          </div>
        </div>
      </div>
    );
  };

  // --- 🌟 戰略小地圖元件 ---
  const renderMiniMap = () => {
    if (state.status !== 'playing' || !battlefieldRef.current) return null;
    
    const mapWidth = 300;
    const scale = mapWidth / state.battlefieldWidth;
    
    const scrollLeft = battlefieldRef.current.scrollLeft;
    const clientWidth = battlefieldRef.current.clientWidth;
    const viewLeft = scrollLeft * scale;
    const viewWidth = clientWidth * scale;

    return (
      <div 
         className="absolute top-[80px] left-1/2 -translate-x-1/2 w-[300px] h-3 bg-slate-900/80 border border-slate-700 rounded-full overflow-hidden z-40 cursor-pointer shadow-lg backdrop-blur-sm"
         onPointerDown={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const clickX = e.clientX - rect.left;
             const targetScroll = (clickX / scale) - clientWidth / 2;
             battlefieldRef.current.scrollLeft = targetScroll;
         }}
      >
        <div className="absolute top-0 h-full bg-white/20 border-x border-white/50" style={{ left: viewLeft, width: viewWidth }}></div>
        
        {/* Player Base (綠色家) */}
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-green-500 shadow-[0_0_5px_green]" style={{ left: GameConfig.constants.PLAYER_BASE_X * scale }}></div>
        
        {/* Enemy Base (紅色家) */}
        <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 shadow-[0_0_5px_red]" style={{ left: state.enemyBaseX * scale }}></div>

        {/* 單位標記 */}
        {state.units.map(u => {
           if(u.hp <= 0) return null;
           const color = u.owner === 'player' ? 'bg-green-400' : 'bg-red-400';
           const size = u.isElite || u.name === '末日裁決者' ? 'w-1.5 h-1.5' : 'w-1 h-1';
           return <div key={`mm-${u.id}`} className={`absolute top-1/2 -translate-y-1/2 ${size} rounded-full ${color}`} style={{ left: u.x * scale }}></div>
        })}
      </div>
    );
  };

  // --- 介面：主選單 ---
  if (state.status === 'menu') {
    return (
      <div className="flex flex-col items-center justify-start h-screen bg-slate-950 text-white p-4 text-center overflow-hidden">
        {renderGlobalNotifications()}
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-green-400 to-purple-600 drop-shadow-lg mb-2 mt-12">
          Cards & Castles
        </h1>
        <p className="text-slate-400 text-sm font-bold tracking-[0.1em] mb-12">Prototype V2 - 線性關卡驗證版</p>

        <div className="flex flex-col space-y-4 w-full max-w-sm">
          <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentStageId(1); setGold(0); setPlayerMaxDpBonus(0); setPlayerBaseHpBonus(0); setBaseUpgradeCost(50); setPlayerDeck(GameConfig.initialDeck.map((id, idx) => ({ uniqueId: `pid_init_${idx}`, baseId: id, upgraded: false }))); engine.current.status = 'deckbuilder'; setTick(t=>t+1); }}
            className="bg-slate-800 border border-slate-600 hover:border-green-500 hover:bg-slate-700 text-white font-bold py-4 px-6 rounded-xl text-lg shadow-lg flex items-center justify-center transition-all">
            <Play className="w-6 h-6 mr-2 text-green-400" /> 開始新遊戲 (Stage 1)
          </button>
        </div>
      </div>
    );
  }

  // --- 介面：牌組檢視器 (僅限局外) ---
  if (state.status === 'deckbuilder') {
    const totalCards = playerDeck.length;
    
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden select-none">
        {renderGlobalNotifications()}
        <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-700 shrink-0">
          <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); engine.current.status = 'menu'; setTick(t=>t+1); }} className="p-2 rounded-full hover:bg-slate-800 text-slate-300"><ArrowLeft className="w-6 h-6" /></button>
          <h2 className="text-xl font-bold text-green-400">出戰牌庫檢視</h2>
          <div className="w-10"></div>
        </div>

        <div className="bg-slate-800 px-4 py-2 flex justify-between items-center text-sm border-b border-slate-700 shrink-0">
          <span className="text-slate-300">總牌數：<b className="text-white">{totalCards}</b> 張</span>
          <span className="text-yellow-400 font-bold flex items-center">金幣: {gold} <Sparkles className="w-4 h-4 ml-1" /></span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-32">
          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
            {playerDeck.map((pCard) => {
              const card = getDeckCardInfo(pCard);
              if (!card) return null;
              return (
                <div key={pCard.uniqueId} className="flex flex-col items-center relative">
                  <div onClick={() => setInspectingCard(card)} className={`relative w-[65px] h-[95px] rounded-lg border-2 flex flex-col items-center pt-2 pb-1 px-1 shadow-md ${card.color} ${pCard.upgraded ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'border-slate-300'} cursor-pointer hover:scale-105`}>
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-500 border border-yellow-200 flex items-center justify-center font-black text-xs text-slate-900">{card.cost}</div>
                    {pCard.upgraded && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 border border-blue-200 flex items-center justify-center font-black text-xs text-white"><ArrowUpCircle className="w-4 h-4" /></div>}
                    <CssIcon id={card.id} className="w-8 h-8 mb-1 text-white opacity-90" />
                    <span className="text-[10px] font-bold text-center leading-tight mt-auto truncate w-full text-white">{card.name}{pCard.upgraded ? '+' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 w-full p-4 bg-slate-900 border-t border-slate-700 flex flex-col space-y-3 z-10">
           <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); startStage(); }} className="w-full max-w-sm mx-auto font-black tracking-widest py-4 px-12 rounded-full text-xl shadow-lg bg-gradient-to-r from-green-600 to-teal-600 text-white">
             {StageConfig[currentStageId] ? `進入 ${StageConfig[currentStageId].name}` : '開始戰鬥'}
           </button>
        </div>
        <InspectModal />
      </div>
    );
  }

  // --- 介面：流浪商店中的「刪除牌組檢視器」 ---
  if (state.status === 'shop_delete') {
    const previewGold = selectedCardToDelete ? gold - deleteCost : gold;
    const canDelete = selectedCardToDelete && gold >= deleteCost;

    return (
      <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden select-none">
        {renderGlobalNotifications()}
        <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-700 shrink-0">
          <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCardToDelete(null); engine.current.status = 'shop'; setTick(t=>t+1); }} className="p-2 rounded-full hover:bg-slate-800 text-slate-300"><ArrowLeft className="w-6 h-6" /></button>
          <h2 className="text-xl font-bold text-red-400">選擇要刪除的卡牌</h2>
          <div className="w-10"></div>
        </div>

        <div className="bg-slate-800 px-4 py-3 flex justify-between items-center text-sm border-b border-slate-700 shrink-0">
          <span className="text-slate-300">刪除費用：<b className="text-yellow-400">{deleteCost} G</b></span>
          <span className="text-slate-300">持有：
            {selectedCardToDelete ? (
              <span className="text-white">
                <span className="line-through text-slate-400 mr-1">{gold}</span>
                <b className={previewGold >= 0 ? "text-green-400" : "text-red-500"}>{previewGold} G</b>
              </span>
            ) : (
              <b className="text-white">{gold} G</b>
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-32">
          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
            {playerDeck.map((pCard) => {
              const card = getDeckCardInfo(pCard);
              if (!card) return null;
              const isSelected = pCard.uniqueId === selectedCardToDelete;

              return (
                <div key={pCard.uniqueId} className="flex flex-col items-center relative">
                  <div onClick={() => {
                      if (isSelected) setSelectedCardToDelete(null);
                      else setSelectedCardToDelete(pCard.uniqueId);
                  }} className={`relative w-[65px] h-[95px] rounded-lg border-2 flex flex-col items-center pt-2 pb-1 px-1 shadow-md ${card.color} ${isSelected ? 'border-red-500 shadow-[0_0_15px_red] scale-110 z-10' : (pCard.upgraded ? 'border-yellow-400' : 'border-slate-500 opacity-80 hover:opacity-100')} cursor-pointer transition-all`}>
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-500 border border-yellow-200 flex items-center justify-center font-black text-xs text-slate-900">{card.cost}</div>
                    {pCard.upgraded && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 border border-blue-200 flex items-center justify-center font-black text-xs text-white"><ArrowUpCircle className="w-4 h-4" /></div>}
                    <CssIcon id={card.id} className="w-8 h-8 mb-1 text-white opacity-90" />
                    <span className="text-[10px] font-bold text-center leading-tight mt-auto truncate w-full text-white">{card.name}{pCard.upgraded ? '+' : ''}</span>
                    {isSelected && <div className="absolute inset-0 bg-red-900/30 rounded-lg pointer-events-none"></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 w-full p-4 bg-slate-900 border-t border-slate-700 flex flex-col space-y-3 z-10">
           <button 
             onPointerDown={(e) => {
               e.preventDefault(); e.stopPropagation();
               if (canDelete) {
                 setGold(g => g - deleteCost);
                 setDeleteCost(c => c + 10);
                 setPlayerDeck(d => d.filter(c => c.uniqueId !== selectedCardToDelete));
                 setSelectedCardToDelete(null);
                 engine.current.status = 'shop';
                 setTick(t=>t+1);
               }
             }} 
             disabled={!canDelete}
             className={`w-full max-w-sm mx-auto font-black tracking-widest py-4 px-12 rounded-xl text-lg shadow-lg transition-colors ${canDelete ? 'bg-red-700 hover:bg-red-600 text-white' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'}`}
           >
             {selectedCardToDelete ? (gold >= deleteCost ? '確認刪除' : '金幣不足') : '請選擇卡牌'}
           </button>
        </div>
      </div>
    );
  }

  // --- 介面：流浪商店中的「基因融合」 ---
  if (state.status === 'shop_fuse') {
    const card1_meta = selectedCardsToFuse.length > 0 ? playerDeck.find(c => c.uniqueId === selectedCardsToFuse[0]) : null;
    const card2_meta = selectedCardsToFuse.length > 1 ? playerDeck.find(c => c.uniqueId === selectedCardsToFuse[1]) : null;
    
    let previewCard = null;
    let isUnlocked = false;
    
    if (card1_meta && card2_meta) {
        const dbCard1 = { ...getDeckCardInfo(card1_meta), isUpgraded: card1_meta.upgraded };
        const dbCard2 = { ...getDeckCardInfo(card2_meta), isUpgraded: card2_meta.upgraded };
        previewCard = getFusionResultCard(dbCard1, dbCard2);
        if (previewCard) {
            isUnlocked = unlockedSet.current.has(previewCard.name);
        }
    }

    const previewGold = previewCard ? gold - fusionCost : gold;
    const canFuse = previewCard && gold >= fusionCost;

    return (
      <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden select-none">
        {renderGlobalNotifications()}
        <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-700 shrink-0">
          <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedCardsToFuse([]); engine.current.status = 'shop'; setTick(t=>t+1); }} className="p-2 rounded-full hover:bg-slate-800 text-slate-300"><ArrowLeft className="w-6 h-6" /></button>
          <h2 className="text-xl font-bold text-purple-400">融合實驗室</h2>
          <div className="w-10"></div>
        </div>

        <div className="bg-slate-800 px-4 py-3 flex justify-between items-center text-sm border-b border-slate-700 shrink-0">
          <span className="text-slate-300">融合費用：<b className="text-yellow-400">{fusionCost} G</b></span>
          <span className="text-slate-300">持有：
            {previewCard ? (
              <span className="text-white">
                <span className="line-through text-slate-400 mr-1">{gold}</span>
                <b className={previewGold >= 0 ? "text-green-400" : "text-red-500"}>{previewGold} G</b>
              </span>
            ) : (
              <b className="text-white">{gold} G</b>
            )}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar pb-48">
          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
            {playerDeck.map((pCard) => {
              const card = getDeckCardInfo(pCard);
              if (!card) return null;
              const isSelected = selectedCardsToFuse.includes(pCard.uniqueId);

              return (
                <div key={pCard.uniqueId} className="flex flex-col items-center relative">
                  <div onClick={() => {
                      if (isSelected) {
                          setSelectedCardsToFuse(prev => prev.filter(id => id !== pCard.uniqueId));
                      } else {
                          if (selectedCardsToFuse.length < 2) {
                              setSelectedCardsToFuse(prev => [...prev, pCard.uniqueId]);
                          }
                      }
                  }} className={`relative w-[65px] h-[95px] rounded-lg border-2 flex flex-col items-center pt-2 pb-1 px-1 shadow-md ${card.color} ${isSelected ? 'border-purple-500 shadow-[0_0_15px_purple] scale-110 z-10' : (pCard.upgraded ? 'border-yellow-400' : 'border-slate-500 opacity-80 hover:opacity-100')} cursor-pointer transition-all`}>
                    <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-500 border border-yellow-200 flex items-center justify-center font-black text-xs text-slate-900">{card.cost}</div>
                    {pCard.upgraded && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-500 border border-blue-200 flex items-center justify-center font-black text-xs text-white"><ArrowUpCircle className="w-4 h-4" /></div>}
                    <CssIcon id={card.id} className="w-8 h-8 mb-1 text-white opacity-90" />
                    <span className="text-[10px] font-bold text-center leading-tight mt-auto truncate w-full text-white">{card.name}{pCard.upgraded ? '+' : ''}</span>
                    {isSelected && <div className="absolute inset-0 bg-purple-900/30 rounded-lg pointer-events-none"></div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 w-full bg-slate-900 border-t border-slate-700 flex flex-col z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
           {card1_meta && card2_meta && (
               <div className="flex items-center justify-center p-3 bg-slate-800 border-b border-slate-700">
                  {previewCard ? (
                      <div className="flex items-center space-x-4">
                         <div className="flex flex-col items-center">
                           <span className="text-xs text-slate-400 mb-1">融合預測</span>
                           <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-lg ${isUnlocked ? previewCard.color : 'bg-slate-700 border-slate-500'}`}>
                              {isUnlocked ? <CssIcon id={previewCard.baseId || previewCard.id} className="w-6 h-6 text-white" /> : <span className="text-2xl font-black text-slate-500">?</span>}
                           </div>
                         </div>
                         <div className="flex flex-col">
                           <span className="text-lg font-black text-white">{isUnlocked ? previewCard.name : '未知物種'}</span>
                           <span className="text-xs text-purple-400">{isUnlocked ? '已解鎖配方' : '未知的融合可能'}</span>
                         </div>
                      </div>
                  ) : (
                      <span className="text-red-400 font-bold">無法融合此組合</span>
                  )}
               </div>
           )}
           <div className="p-4">
             <button 
               onPointerDown={(e) => {
                 e.preventDefault(); e.stopPropagation();
                 if (canFuse) {
                   setGold(g => g - fusionCost);
                   setPlayerDeck(d => {
                      const newDeck = d.filter(c => !selectedCardsToFuse.includes(c.uniqueId));
                      newDeck.push({
                          uniqueId: `pid_fuse_${Date.now()}`,
                          baseId: previewCard.baseId || previewCard.id,
                          upgraded: card1_meta.upgraded || card2_meta.upgraded, 
                          fusedAffixes: previewCard.fusedAffixes,
                          isElite: previewCard.isElite 
                      });
                      return newDeck;
                   });
                   
                   if (!isUnlocked && previewCard.category === 'entity') {
                      const unlockKey = previewCard.name;
                      unlockedSet.current.add(unlockKey);
                      const toastId = Date.now() + Math.random();
                      setUnlockNotifications(prev => [...prev, { id: toastId, name: previewCard.name, color: previewCard.color, baseId: previewCard.baseId || previewCard.id }]);
                      setTimeout(() => { setUnlockNotifications(prev => prev.filter(t => t.id !== toastId)); }, 4000);
                   }

                   // 🌟 顯示合成結果圖鑑
                   setInspectingCard({ ...previewCard, isFusionResult: true });
                 }
               }} 
               disabled={!canFuse}
               className={`w-full max-w-sm mx-auto font-black tracking-widest py-4 px-12 rounded-xl text-lg shadow-lg transition-colors ${canFuse ? 'bg-purple-700 hover:bg-purple-600 text-white' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'}`}
             >
               {previewCard ? (gold >= fusionCost ? '執行融合' : '金幣不足') : '請選擇有效組合'}
             </button>
           </div>
        </div>
        
        <InspectModal />
      </div>
    );
  }

  // --- 介面：局外商店 ---
  if (state.status === 'shop') {
    const fusionUnlocked = currentStageId >= (GameConfig.constants.UNLOCK_STAGE_FUSION || 2);
    const deleteUnlocked = currentStageId >= (GameConfig.constants.UNLOCK_STAGE_DELETE || 2);
    const rerollUnlocked = currentStageId >= (GameConfig.constants.UNLOCK_STAGE_REROLL || 1);

    const handleReroll = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (gold >= rerollCost) {
          setGold(g => g - rerollCost);
          
          const weightKey = `w${currentStageId}`;
          const pool = [];
          Object.values(ShopConfig).forEach(item => {
            const weight = item[weightKey] || 0;
            for (let i = 0; i < weight; i++) pool.push(item.id);
          });

          setShopCards(prevCards => prevCards.map(card => {
            if (card === null) return null; 
            if (pool.length > 0) {
              const randIdx = Math.floor(Math.random() * pool.length);
              return CardDatabase[pool[randIdx]];
            }
            return card;
          }));

          setRerollCost(c => c + (GameConfig.constants.REROLL_COST_INCREMENT || 5));
      } else {
          alert("金幣不足！");
      }
    };

    return (
      <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden select-none">
        {renderGlobalNotifications()}
        
        {/* 🌟 商店標題與金錢常駐區塊 */}
        <div className="flex items-center justify-center p-4 bg-slate-900 border-b border-slate-700 shrink-0 shadow-lg relative z-20">
          <ShoppingCart className="w-6 h-6 mr-2 text-yellow-400" />
          <h2 className="text-xl font-bold text-yellow-400">流浪商人</h2>
        </div>

        <div className="bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-700 shrink-0 z-10 shadow-sm">
           <span className="text-slate-300 font-bold text-sm">持有資金</span>
           <span className="text-2xl font-black text-yellow-400 flex items-center">{gold} <Sparkles className="w-5 h-5 ml-1.5" /></span>
        </div>

        <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-6 hide-scrollbar pb-32">
          
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <h3 className="text-slate-300 font-bold mb-4 flex items-center"><ArrowUpCircle className="w-4 h-4 mr-1 text-blue-400"/> 主堡科技</h3>
            <p className="text-xs text-slate-500 mb-3">戰鬥時擁有更高的 DP 上限與防守血量。</p>
            <button 
                onClick={() => {
                    if (hasUpgradedCastle) return;
                    if (gold >= baseUpgradeCost) {
                        setGold(g => g - baseUpgradeCost);
                        setPlayerMaxDpBonus(dp => dp + 2);
                        setPlayerBaseHpBonus(hp => hp + 200);
                        setBaseUpgradeCost(c => Math.floor(c * 1.5));
                        setHasUpgradedCastle(true);
                    } else {
                        alert("金幣不足！");
                    }
                }}
                disabled={hasUpgradedCastle || gold < baseUpgradeCost}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center text-sm transition-colors ${hasUpgradedCastle ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' : (gold >= baseUpgradeCost ? 'bg-blue-900/30 text-blue-400 border border-blue-500/50 hover:bg-blue-900/60' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed')}`}
            >
                <ArrowUpCircle className="w-5 h-5 mr-2" /> 
                {hasUpgradedCastle ? '已達本局升級上限' : `提升最大 DP +2 / 血量 +200 (花費 ${baseUpgradeCost} G)`}
            </button>
          </div>

          {fusionUnlocked && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <h3 className="text-slate-300 font-bold mb-4 flex items-center"><FlaskConical className="w-4 h-4 mr-1 text-purple-400"/> 基因融合</h3>
              <p className="text-xs text-slate-500 mb-4">將牌組中的兩張卡牌進行融合，創造出全新的兵種或裝備。</p>
              <button 
                  onClick={() => {
                      setSelectedCardsToFuse([]);
                      engine.current.status = 'shop_fuse';
                      setTick(t => t + 1);
                  }}
                  className="w-full py-3 rounded-lg font-bold flex items-center justify-center text-sm transition-colors bg-purple-900/30 text-purple-400 border border-purple-500/50 hover:bg-purple-900/60"
              >
                  <Zap className="w-5 h-5 mr-2" /> 進入融合實驗室
              </button>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-slate-300 font-bold flex items-center"><Plus className="w-4 h-4 mr-1 text-green-400"/> 招募新血</h3>
               {rerollUnlocked && (
                  <button onPointerDown={handleReroll} disabled={gold < rerollCost} className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center transition-colors ${gold >= rerollCost ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-500/50 hover:bg-indigo-900/70' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'}`}>
                     <RefreshCw className="w-3 h-3 mr-1" /> 刷新商品 ({rerollCost} G)
                  </button>
               )}
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {shopCards.map((card, idx) => {
                if (!card) {
                  return (
                    <div key={`shop-empty-${idx}`} className="flex flex-col items-center justify-center w-[70px] h-[100px] border-2 border-slate-700 border-dashed rounded-lg opacity-50 mt-2">
                      <span className="text-xs font-bold text-slate-500">已售出</span>
                    </div>
                  );
                }
                const shopInfo = ShopConfig[card.id];
                const price = shopInfo ? shopInfo.basePrice : 20;
                const canBuy = gold >= price;
                return (
                  <div key={`shop-${card.id}-${idx}`} className="flex flex-col items-center">
                    <div onClick={() => setInspectingCard(card)} className={`relative w-[70px] h-[100px] rounded-lg border-2 flex flex-col items-center pt-2 pb-1 px-1 shadow-md ${card.color} border-slate-300 cursor-pointer`}>
                      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center font-black text-xs text-slate-900">{card.cost}</div>
                      <CssIcon id={card.id} className="w-8 h-8 mb-1 text-white opacity-90 mt-1" />
                      <span className="text-[10px] font-bold text-center leading-tight mt-auto text-white truncate w-full">{card.name}</span>
                    </div>
                    <button 
                      onClick={() => { 
                        if(canBuy) { 
                          setGold(g => g - price); 
                          setPlayerDeck(d => [...d, { uniqueId: `pid_shop_${Date.now()}_${idx}`, baseId: card.id, upgraded: false }]); 
                          setShopCards(s => s.map((c, i) => i === idx ? null : c));
                        } 
                      }}
                      disabled={!canBuy || !card}
                      className={`mt-2 px-3 py-1 rounded font-bold text-xs w-full flex justify-center items-center ${canBuy && card ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-slate-800 text-slate-600'}`}>
                      {card ? `${price} G` : '已售出'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {deleteUnlocked && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <h3 className="text-slate-300 font-bold mb-4 flex items-center"><Trash2 className="w-4 h-4 mr-1 text-red-400"/> 牌組精簡</h3>
              <p className="text-xs text-slate-500 mb-4">刪除不需要的卡牌，提高核心陣容的抽牌機率。</p>
              <button 
                  onClick={() => {
                      if (gold >= deleteCost) {
                          engine.current.status = 'shop_delete';
                          setTick(t => t + 1);
                      } else {
                          alert("金幣不足！");
                      }
                  }}
                  className={`w-full py-3 rounded-lg font-bold flex items-center justify-center text-sm transition-colors ${gold >= deleteCost ? 'bg-red-900/30 text-red-400 border border-red-500/50 hover:bg-red-900/60' : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'}`}
              >
                  <Trash2 className="w-5 h-5 mr-2" /> 選擇卡牌刪除 (花費 {deleteCost} G)
              </button>
            </div>
          )}

        </div>

        <div className="absolute bottom-0 w-full p-4 bg-slate-900 border-t border-slate-700 flex flex-col z-10">
           <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); engine.current.status = 'deckbuilder'; setTick(t=>t+1); }} className="w-full font-black tracking-widest py-4 rounded-xl text-lg shadow-lg bg-slate-700 hover:bg-slate-600 text-white">
             結束購物 / 檢視牌組
           </button>
        </div>
        <InspectModal />
      </div>
    );
  }

  // --- 介面：過關結算 ---
  if (state.status === 'stage_clear') {
    let nextStageId = currentStageId + 1;
    if (!StageConfig[nextStageId]) {
        nextStageId = currentStageId; 
    }

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-950/95 text-white p-6 text-center">
        {renderGlobalNotifications()}
        <h2 className="text-5xl font-black mb-6 text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">STAGE CLEARED</h2>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm mb-8 shadow-xl">
          
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-4">
             <span className="text-slate-400 font-bold">通關基礎賞金</span>
             <span className="text-2xl font-black text-yellow-400">+{state.earnedBaseGold} G</span>
          </div>
          
          {state.earnedBonusGold > 0 && (
            <div className="flex justify-between items-center mb-6">
               <span className="text-slate-400 font-bold">速通時間加成</span>
               <span className="text-2xl font-black text-yellow-400">+{state.earnedBonusGold} G</span>
            </div>
          )}

          <div className="h-px w-full bg-slate-700 mb-6"></div>
          
          <p className="text-slate-400 font-bold mb-2">總獲得賞金</p>
          <p className="text-4xl font-black text-yellow-400 flex items-center justify-center">
            +{state.earnedBaseGold + state.earnedBonusGold} <Sparkles className="w-8 h-8 ml-2" />
          </p>
        </div>

        {/* 🌟 核心修改：使用 onPointerDown 並傳遞正確的 targetStageId */}
        <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentStageId(nextStageId); enterShop(nextStageId); }} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black tracking-widest py-4 px-12 rounded-full text-xl shadow-[0_0_20px_rgba(79,70,229,0.5)]">
          前往流浪商店
        </button>
      </div>
    );
  }

  // --- 以下為單局戰鬥 (playing) 畫面 ---

  const isGracePeriod = state.waveTime < 0;
  let countdownText = "";
  if (isGracePeriod) countdownText = `備戰: ${Math.ceil(Math.abs(state.waveTime))}s`;
  else if (state.waveTime < state.clearTime) countdownText = `限制時間: ${Math.max(0, state.clearTime - state.waveTime).toFixed(0)}s`;
  else countdownText = "末日降臨！";
  
  const isAffixClickSelected = !!selectedAffixId; 
  const isAffixDragging = dragState.isDragging && dragState.category === 'affix';

  const playerHpPercent = state.maxPlayerBaseHp > 0 ? Math.max(0, Math.min(100, (state.playerBaseHp / state.maxPlayerBaseHp) * 100)) : 0;
  const enemyHpPercent = state.maxEnemyBaseHp > 0 ? Math.max(0, Math.min(100, (state.enemyBaseHp / state.maxEnemyBaseHp) * 100)) : 0;
  
  const dpInterval = state.dpRegenBaseInterval;
  const dpPercent = Math.max(0, Math.min(100, (state.dpRegenTimer / dpInterval) * 100));

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white font-sans overflow-hidden select-none touch-manipulation" onContextMenu={(e) => { e.preventDefault(); return false; }}>
      
      {/* 全域解鎖通知 */}
      {renderGlobalNotifications()}

      {/* 戰鬥中獲取金錢提示 UI */}
      <div className={`absolute top-32 right-4 bg-slate-900/90 border-2 border-yellow-500 rounded-xl px-4 py-2 flex items-center shadow-[0_0_15px_rgba(234,179,8,0.5)] z-50 transition-opacity duration-500 ${goldUIVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Sparkles className="w-5 h-5 text-yellow-400 mr-2" />
          <span className="text-yellow-400 font-black text-xl">{gold} G</span>
      </div>

      {/* 頂部狀態列 */}
      <div className="flex justify-between items-center p-3 bg-slate-900 border-b border-slate-700 shadow-md z-10 shrink-0">
        <div className="flex flex-col w-1/3">
          <span className="text-xs text-green-400 font-bold">{StageConfig[currentStageId]?.name || '防禦陣地'}</span>
          <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden mt-1"><div className="bg-green-500 h-full transition-all" style={{ width: `${playerHpPercent}%` }}></div></div>
          <span className="text-xs mt-1">{Math.floor(state.playerBaseHp)}/{state.maxPlayerBaseHp}</span>
        </div>
        <div className="flex flex-col items-center flex-1 mx-2 bg-slate-800 p-2 rounded-lg border border-slate-700 relative overflow-hidden">
          <div className="absolute left-0 bottom-0 h-1 bg-yellow-500/50" style={{ width: `${dpPercent}%` }}></div>
          <div className="flex items-center text-yellow-400 font-bold text-xl relative z-10"><Zap className="w-5 h-5 mr-1 fill-yellow-400" />{Math.floor(state.dp)} <span className="text-sm text-slate-400 ml-1">/ {state.dpMax}</span></div>
        </div>
        <div className="flex flex-col w-1/3 items-end justify-center">
          <span className={`text-sm font-bold ${state.waveTime >= state.clearTime ? 'text-red-400 animate-pulse' : (isGracePeriod ? 'text-green-400' : 'text-red-300')}`}>{countdownText}</span>
        </div>
      </div>
      
      {/* 戰略小地圖 */}
      {renderMiniMap()}

      {/* 戰鬥區域外層容器 */}
      <div className="flex-1 relative w-full overflow-hidden flex flex-col bg-slate-800">
        <div 
            ref={battlefieldRef} 
            className={`battlefield-zone flex-1 relative w-full overflow-x-auto overflow-y-hidden hide-scrollbar transition-colors ${isAffixDragging ? 'bg-indigo-900/20 shadow-[inset_0_0_50px_rgba(99,102,241,0.2)]' : 'cursor-grab active:cursor-grabbing'}`} 
            style={{ scrollBehavior: 'smooth' }}
            onPointerDown={handleMapPointerDown}
            onPointerLeave={handleMapPointerUp}
            onPointerUp={handleMapPointerUp}
            onPointerMove={handleMapPointerMove}
        >
          
          {isAffixDragging && (
             <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-300/30 text-4xl font-black tracking-widest pointer-events-none z-0">
               拖曳至此以空放法術
             </div>
          )}

          <div className="relative h-full" style={{ width: `${state.battlefieldWidth}px`, backgroundImage: 'linear-gradient(to right, #1e293b 1px, transparent 1px)', backgroundSize: '100px 100%' }}>
            <div className="absolute bottom-0 w-full h-1/3 bg-slate-900 border-t border-slate-700"></div>

            {/* 空放法術/地面效果/浮動特效渲染 */}
            {state.effects.map(eff => {
               if (eff.type === 'haste_array') {
                  return (
                    <div key={eff.id} className="absolute bottom-0 h-1/3 bg-red-600/30 border-t-2 border-red-500 animate-pulse pointer-events-none flex items-center justify-center" style={{ left: `${eff.x - eff.width/2}px`, width: `${eff.width}px` }}>
                       <span className="text-red-500 font-bold opacity-50">加速陣</span>
                    </div>
                  );
               }
               if (eff.type === 'fire_burst' || eff.type === 'gravity_slow') {
                  const isFire = eff.type === 'fire_burst';
                  return (
                    <div key={eff.id} className={`absolute bottom-[10%] rounded-full opacity-0 animate-[ping_0.5s_ease-out] pointer-events-none ${isFire ? 'bg-orange-500/50' : 'bg-indigo-500/50'}`} style={{ left: `${eff.x - eff.width/2}px`, width: `${eff.width}px`, height: `${eff.width}px` }}></div>
                  );
               }
               if (eff.type === 'gold_float') {
                  return (
                    <div key={eff.id} className="absolute bottom-[30%] -translate-x-1/2 pointer-events-none animate-float-up" style={{ left: `${eff.x}px`, zIndex: 20000 }}>
                       <span className="text-yellow-400 font-black text-xl drop-shadow-[0_0_5px_rgba(0,0,0,0.8)]">{eff.text}</span>
                    </div>
                  );
               }
               if (eff.type === 'hit_spark') {
                  const filterStyle = eff.owner === 'player' ? { filter: 'hue-rotate(200deg) saturate(1.5)' } : {};
                  return (
                    <div key={eff.id} className="absolute bottom-[25%] -translate-x-1/2 pointer-events-none text-2xl animate-hit-spark" style={{ left: `${eff.x}px`, marginBottom: `${eff.yOffset}px`, zIndex: 20000, ...filterStyle }}>
                       💥
                    </div>
                  );
               }
               return null;
            })}

            {/* 我方主堡 */}
            <div className="absolute bottom-[20%] flex flex-col items-center justify-end z-10" style={{ left: `${GameConfig.constants.PLAYER_BASE_X - GameConfig.constants.BASE_WIDTH/2}px`, width: `${GameConfig.constants.BASE_WIDTH}px`, height: '150px' }}>
              <div className="absolute top-[-20px] w-full h-2 bg-slate-900 rounded-full border border-slate-700 overflow-hidden">
                 <div className="h-full bg-green-500 transition-all" style={{width: `${playerHpPercent}%`}}></div>
              </div>
              <div className="w-24 h-32 bg-green-900 border-4 border-green-600 rounded-t-lg relative shadow-lg shadow-green-500/20"></div>
            </div>

            {/* 敵方出怪點 (虛擬主堡) */}
            <div className="absolute bottom-[20%] flex flex-col items-center justify-end z-10" style={{ left: `${state.enemyBaseX - GameConfig.constants.BASE_WIDTH/2}px`, width: `${GameConfig.constants.BASE_WIDTH}px`, height: '150px' }}>
              <div className="absolute top-[-20px] w-full h-2 bg-slate-900 rounded-full border border-slate-700 overflow-hidden">
                 <div className="h-full bg-red-500 transition-all" style={{width: `${enemyHpPercent}%`}}></div>
              </div>
              <div className="w-24 h-32 bg-slate-950 border-4 border-red-800 rounded-t-lg relative shadow-[0_0_30px_rgba(220,38,38,0.5)] overflow-hidden">
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-red-600 rounded-full animate-pulse shadow-[0_0_20px_#E64A19]"></div>
              </div>
            </div>

            {/* 單位渲染 */}
            {state.units.map(unit => {
              const isPlayer = unit.owner === 'player';
              
              let bgClass = 'bg-green-700';
              let borderClass = 'border-green-400';
              let shadowClass = '';

              if (unit.isElite) {
                bgClass = 'bg-yellow-600';
                borderClass = 'border-yellow-300';
                shadowClass = 'shadow-[0_0_15px_yellow]';
              } else if (unit.isAbomination) {
                bgClass = 'bg-rose-900';
                borderClass = 'border-rose-500';
                shadowClass = 'shadow-[0_0_10px_red]';
              } else if (unit.affixColors && unit.affixColors.length > 0) {
                bgClass = unit.affixColors[unit.affixColors.length - 1]; 
                borderClass = 'border-white/70';
                shadowClass = 'shadow-[0_0_12px_rgba(255,255,255,0.4)]';
              }

              const unitStyle = isPlayer 
                  ? `${bgClass} ${borderClass} ${shadowClass}` 
                  : 'bg-red-900 border-red-500';

              const isBurning = unit.burns && unit.burns.length > 0;
              const isSlowed = unit.slowTimer > 0;
              const isHasted = unit.hasteAuraTimer > 0;

              let scaleClass = unit.hasGigantification ? 1.5 : 1;
              if (unit.name === '末日裁決者') scaleClass = 3; 

              const unitHpPercent = unit.maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0;

              const isAttackingNow = unit.attackAnimTimer > 0;
              const lungeOffset = isAttackingNow ? (isPlayer ? 15 : -15) : 0;
              
              const unitNumId = parseInt(unit.id.split('_')[1] || 0, 10);
              const unitZIndex = 10000 - unitNumId;

              return (
                <div key={unit.id} className={`absolute bottom-[25%] transition-transform duration-100 origin-bottom ${unit.isAbomination ? 'animate-[shake_0.5s_infinite]' : ''}`} style={{ left: `${unit.x}px`, transform: `translateX(calc(-50% + ${lungeOffset}px)) scale(${scaleClass})`, zIndex: unitZIndex }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex space-x-1">
                     {isBurning && <span className="text-[10px] text-orange-500 animate-bounce">🔥</span>}
                     {isSlowed && <span className="text-[10px] text-blue-300">🧊</span>}
                     {isHasted && <span className="text-[10px] text-red-400">⚡</span>}
                     {unit.isHealer && <span className="text-[10px] text-emerald-400 opacity-50">✨</span>}
                  </div>
                  <div className="w-10 h-1.5 bg-slate-900 rounded-full absolute -top-4 left-1/2 -translate-x-1/2 overflow-hidden border border-slate-700">
                    <div className={`h-full ${isPlayer ? 'bg-green-400' : 'bg-red-500'}`} style={{ width: `${unitHpPercent}%` }}></div>
                  </div>
                  <div className={`w-8 h-10 rounded-sm flex items-center justify-center border-2 ${unitStyle}`}>
                    <CssIcon id={unit.baseId} className={`w-5 h-5 ${isPlayer ? 'text-white' : 'text-slate-400'} opacity-90`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部操作區 */}
      <div className="h-[235px] bg-slate-900 border-t border-slate-700 flex flex-col shrink-0 z-30">
        <div className="flex justify-between items-center px-2 py-1 bg-slate-800/80 text-[10px] text-slate-400 border-b border-slate-700/50 shadow-sm z-10">
          <div className="flex items-center space-x-2"><span className="flex items-center text-green-300"><HeaderShield className="w-3 h-3 mr-1"/> 駐紮區 (植入/部署)</span></div>
        </div>

        {/* 駐紮區 */}
        <div className={`deployment-zone-droppable flex px-2 py-2 space-x-2 overflow-x-auto hide-scrollbar h-[72px] border-b border-slate-800/80 transition-all duration-300 relative z-0
            ${dragState.isDragging && dragState.category !== 'affix' && dragState.hover?.type !== 'deploy' ? 'bg-green-900/20 border-t-2 border-green-500/50 border-dashed animate-pulse' : ''}
            ${dragState.hover?.type === 'deploy' ? 'bg-green-800/40 border-t-2 border-green-400' : 'bg-slate-900/50'}
        `}>
          {sortedDeployed.map((dep, depIdx) => {
            const isValidTarget = dep.affixes.length < 2;
            const isHoveredByDrag = dragState.hover?.type === 'buff' && dragState.hover?.id === dep.deployedId;
            const isElite = dep.cardData.isElite; 
            
            let currentHp = 0, totalMaxHp = 0;
            state.units.forEach(u => { if (dep.unitIds.includes(u.id)) { currentHp += Math.max(0, u.hp); totalMaxHp += u.maxHp; } });
            
            const hpPercent = totalMaxHp > 0 ? Math.max(0, Math.min(100, (currentHp / totalMaxHp) * 100)) : 0;
            
            let borderClass = 'border-slate-600', bgClass = 'bg-slate-800';
            if (isHoveredByDrag) { borderClass = 'border-yellow-400 scale-110 shadow-[0_0_15px_rgba(250,204,21,0.8)] z-10'; bgClass = 'bg-yellow-900/60'; }
            else if ((isAffixDragging || (isAffixClickSelected && isValidTarget)) && isValidTarget) { borderClass = 'border-yellow-400/50 shadow-[0_0_8px_rgba(250,204,21,0.3)] animate-pulse'; }
            else if (isElite) { borderClass = 'border-yellow-500'; bgClass = 'bg-gradient-to-t from-yellow-900/40 to-slate-800'; }

            if(dep.unitIds.every(id => !state.units.find(u => u.id === id))) return null; 

            return (
              <div key={dep.deployedId} data-deployed-id={dep.deployedId} onClick={() => handleDeployedClick(dep.deployedId)} className={`deployed-unit-droppable min-w-[48px] h-full rounded border flex flex-col items-center transition-all overflow-hidden ${borderClass} ${bgClass} cursor-pointer`}>
                {totalMaxHp > 0 && <div className="absolute top-0 left-0 w-full h-1 bg-slate-900/80 z-10"><div className="h-full bg-green-500" style={{ width: `${hpPercent}%` }}></div></div>}
                {isElite && <div className="absolute top-1 right-1 text-[8px] text-yellow-400 font-black z-10">★</div>}
                <CssIcon id={dep.cardData.baseId || dep.cardData.id} className={`w-6 h-6 mt-2 opacity-80 ${isElite ? 'text-yellow-400' : 'text-white'}`} />
                <div className="flex w-full mt-auto mb-1.5 justify-center space-x-1 px-1 z-10">
                  {[0, 1].map(slotIndex => {
                    const affix = dep.affixes[slotIndex];
                    if (!affix) return <div key={`dep-${dep.deployedId}-slot-${slotIndex}`} className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-slate-700"></div>;
                    return <div key={`dep-${dep.deployedId}-slot-${slotIndex}`} className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${affix.color}`}><CssIcon id={affix.id} className="w-2.5 h-2.5 text-white" /></div>;
                  })}
                </div>
              </div>
            );
          })}
          {state.deployed.length === 0 && <div className="w-full flex items-center justify-center text-[10px] text-slate-600 italic px-1 h-full pointer-events-none">防線空虛</div>}
        </div>

        {/* 手牌區 */}
        <div className="flex-1 flex items-end justify-center px-1 pb-2 space-x-1 overflow-visible relative pt-2 hand-zone">
           <div className="absolute left-1 bottom-4 flex flex-col space-y-2 text-[10px] z-0">
              <div className="flex flex-col items-center p-1 bg-slate-800 rounded border border-slate-700 w-10 relative overflow-hidden">
                <div className={`absolute bottom-0 left-0 w-full bg-green-900/50 transition-all ${state.flags.isShuffling ? 'h-full animate-pulse' : 'h-0'}`}></div>
                <span className="font-bold relative z-10 text-green-300 text-xs">{state.deck.length}</span><span className="text-slate-500 relative z-10 text-[9px]">魔典</span>
              </div>
              <div className="flex flex-col items-center p-1 bg-slate-800 rounded border border-slate-700 w-10">
                <span className="font-bold text-xs">{state.discard.length}</span><span className="text-slate-500 text-[9px]">灰燼</span>
              </div>
           </div>

           <div className="flex space-x-1 z-10 w-full justify-center pl-10 pr-2 relative">
             {state.hand.map((card) => {
               const overMaxDp = state.dpMax < card.cost;
               const canPlay = state.dp >= card.cost && !overMaxDp;
               const isDraggingThis = dragState.id === card.instanceId;
               const isClickSelectedThis = selectedAffixId === card.instanceId;

               return (
                 <div key={card.instanceId} className="hand-card-droppable relative" data-instance-id={card.instanceId}>
                   <button onPointerDown={(e) => handlePointerDown(e, card.instanceId)} style={{ touchAction: 'none' }} 
                     className={`relative w-[56px] h-[84px] rounded-lg border-2 flex flex-col items-center pt-2 pb-1 px-0.5 transition-transform origin-bottom shrink-0 z-20
                        ${!isDraggingThis && !isClickSelectedThis && canPlay ? `${card.color} border-slate-300 hover:-translate-y-3 cursor-pointer` : ''}
                        ${!isDraggingThis && !isClickSelectedThis && !canPlay ? 'bg-slate-700 border-slate-600 opacity-50 cursor-pointer' : ''}
                        ${(isDraggingThis || isClickSelectedThis) ? card.color + ' border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)] scale-110 -translate-y-6' : ''}
                        ${card.isToken ? 'border-purple-400 shadow-[inset_0_0_8px_purple]' : ''} 
                     `}>
                     {overMaxDp && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[7px] px-1 rounded-sm z-20">需研發</div>}
                     <div className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full border flex items-center justify-center font-black text-[9px] z-10 ${overMaxDp ? 'bg-red-500 border-red-300 text-white' : 'bg-yellow-500 border-yellow-200 text-slate-900'}`}>{card.cost}</div>
                     <CssIcon id={card.baseId || card.id} className={`w-6 h-6 mb-1 ${(canPlay || isDraggingThis || isClickSelectedThis) ? 'text-white' : 'text-slate-400'}`} />
                     <span className="text-[9px] font-bold text-center leading-tight mt-auto truncate w-full">{card.name}</span>
                     
                     <div className="flex space-x-0.5 mt-0.5 relative z-10 pointer-events-none">
                       {card.isToken && <span className="bg-purple-900/80 px-1 rounded text-[7px] text-purple-300">融合</span>}
                       {card.category === 'affix' && !card.isToken && <span className="bg-yellow-900/80 px-1 rounded text-[7px] text-yellow-300">魔咒</span>}
                       {card.category === 'entity' && !card.isToken && <span className="bg-green-900/80 px-1 rounded text-[7px] text-green-300">素體</span>}
                     </div>

                     {card.fusedAffixes && card.fusedAffixes.length > 0 && (
                        <div className="absolute -right-1 -bottom-1 flex flex-col space-y-0.5">
                          {card.fusedAffixes.map((afx, idx) => (
                             <div key={`card-${card.instanceId}-afx-${idx}`} className={`w-3 h-3 rounded-full flex items-center justify-center border border-white/50 ${afx.color}`}><CssIcon id={afx.id} className="w-2 h-2 text-white" /></div>
                          ))}
                        </div>
                     )}
                   </button>
                 </div>
               );
             })}
           </div>
        </div>
      </div>

      {/* 🌟 死亡結算畫面，圖層設置在 z-[99999] */}
      {(state.status === 'gameover') && (
        <div className="absolute inset-0 z-[99999] bg-slate-950/90 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
          {renderGlobalNotifications()}
          <h2 className="text-5xl font-black mb-4 text-red-500">DEFEAT</h2>
          <p className="text-slate-300 mb-8">未能及時摧毀目標，或我方陣地失守。</p>
          <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); engine.current.status = 'menu'; setTick(t=>t+1); }} className="bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white font-bold py-3 px-10 rounded-full text-lg shadow-lg">放棄掙扎，重新來過</button>
        </div>
      )}

      <InspectModal />

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .icon-mask { display: inline-block; background-color: currentColor; -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; }

        @keyframes shake { 0%, 100% {transform: translateX(0) scale(1.05);} 25% {transform: translateX(-2px) scale(1.05);} 75% {transform: translateX(2px) scale(1.05);} }

        @keyframes float-up {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-50px) scale(1.2); opacity: 0; }
        }
        .animate-float-up { animation: float-up 1.5s ease-out forwards; }

        @keyframes hit-spark {
           0% { transform: scale(0.5) rotate(0deg); opacity: 1; }
           50% { transform: scale(1.5) rotate(15deg); opacity: 1; }
           100% { transform: scale(2) rotate(30deg); opacity: 0; }
        }
        .animate-hit-spark { animation: hit-spark 0.3s ease-out forwards; }

        @keyframes unlock-toast-anim {
          0% { transform: translateX(120%); opacity: 0; }
          5% { transform: translateX(0); opacity: 1; }
          90% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-30px); opacity: 0; }
        }
        .animate-unlock-toast { animation: unlock-toast-anim 4s ease-in-out forwards; }

        /* Icons */
        .icon-goblin { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8'/%3E%3Cpath d='M4 12c0 4.4 3.6 8 8 8s8-3.6 8-8'/%3E%3Cpath d='M2 10l4 2-4 4'/%3E%3Cpath d='M22 10l-4 2 4 4'/%3E%3Cpath d='M9 14h6'/%3E%3Ccircle cx='8' cy='10' r='1'/%3E%3Ccircle cx='16' cy='10' r='1'/%3E%3C/svg%3E"); }
        .icon-wolf { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 13c-2 0-3.5 2-3.5 4s1.5 4 3.5 4 3.5-2 3.5-4-1.5-4-3.5-4z'/%3E%3Cpath d='M7 11c-1.5 0-2.5 1.5-2.5 3s1 2.5 2.5 2.5 2.5-1.5 2.5-3-1-2.5-2.5-2.5z'/%3E%3Cpath d='M17 11c-1.5 0-2.5 1.5-2.5 3s1 2.5 2.5 2.5 2.5-1.5 2.5-3-1-2.5-2.5-2.5z'/%3E%3Cpath d='M10 4c-1 0-1.5 1.5-1.5 2.5S9 9 10 9s1.5-1.5 1.5-2.5S11 4 10 4z'/%3E%3Cpath d='M14 4c-1 0-1.5 1.5-1.5 2.5S13 9 14 9s1.5-1.5 1.5-2.5S15 4 14 4z'/%3E%3C/svg%3E"); }
        .icon-elf { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3v18'/%3E%3Cpath d='M3 12h18'/%3E%3Cpath d='M12 3c-3 0-4 3-4 6 0 3 4 3 4 3s4 0 4-3c0-3-1-6-4-6z'/%3E%3Cpath d='M3 12c0-3 3-4 6-4 3 0 3 4 3 4s0 4-3 4c-3 0-6-1-6-4z'/%3E%3Cpath d='M21 12c0-3-3-4-6-4-3 0-3 4-3 4s0 4 3 4c3 0 6-1 6-4z'/%3E%3Cpath d='M12 21c-3 0-4-3-4-6 0-3 4-3 4-3s4 0 4 3c0 3-1 6-4 6z'/%3E%3C/svg%3E"); }
        .icon-abomination { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 4c-4 0-7 2-8 5-1 3 0 7 2 9s6 3 9 1 4-5 4-8c0-4-3-7-7-7z'/%3E%3Ccircle cx='10' cy='10' r='2'/%3E%3Ccircle cx='15' cy='12' r='1'/%3E%3Cpath d='M10 10h.01'/%3E%3Cpath d='M15 12h.01'/%3E%3Cpath d='M8 15c1 1 3 1 4 0'/%3E%3Cpath d='M4 10c-2-1-3 0-3 2'/%3E%3Cpath d='M20 10c2-1 3 0 3 2'/%3E%3Cpath d='M16 20c1 2 3 2 4 1'/%3E%3C/svg%3E"); }
        .icon-rage_potion { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 2h6'/%3E%3Cpath d='M12 2v6'/%3E%3Cpath d='M10 8l-6 10c-1 1.5 0 4 2 4h12c2 0 3-2.5 2-4l-6-10'/%3E%3Cpath d='M6 14h12'/%3E%3Ccircle cx='12' cy='18' r='1'/%3E%3C/svg%3E"); }
        .icon-stone_armor { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3Cpath d='M8 10h8'/%3E%3Cpath d='M6 14h12'/%3E%3Cpath d='M12 10v4'/%3E%3Cpath d='M10 14v4'/%3E%3Cpath d='M14 14v3'/%3E%3C/svg%3E"); }
        .icon-fire_enchant { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z'/%3E%3C/svg%3E"); }
        .icon-gigantification { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 3l-6 6'/%3E%3Cpath d='M21 3v6'/%3E%3Cpath d='M21 3h-6'/%3E%3Cpath d='M3 21l6-6'/%3E%3Cpath d='M3 21v-6'/%3E%3Cpath d='M3 21h6'/%3E%3Cpath d='M21 21l-6-6'/%3E%3Cpath d='M21 21v-6'/%3E%3Cpath d='M21 21h-6'/%3E%3Cpath d='M3 3l6 6'/%3E%3Cpath d='M3 3v6'/%3E%3Cpath d='M3 3h6'/%3E%3C/svg%3E"); }
        
        .icon-goblin_knight { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3Cpath d='M12 16c-1 0-1.5 1-1.5 2s.5 2 1.5 2 1.5-2 1.5-2-.5-2-1.5-2z'/%3E%3Cpath d='M9.5 14.5c-.8 0-1.2.8-1.2 1.5s.5 1.5 1.2 1.5 1.2-.8 1.2-1.5-.5-1.5-1.2-1.5z'/%3E%3Cpath d='M14.5 14.5c-.8 0-1.2.8-1.2 1.5s.5 1.5 1.2 1.5 1.2-.8 1.2-1.5-.5-1.5-1.2-1.5z'/%3E%3Cpath d='M11 11c-.5 0-.8.8-.8 1.2s.3 1.2.8 1.2.8-.8.8-1.2-.3-1.2-.8-1.2z'/%3E%3Cpath d='M13 11c-.5 0-.8.8-.8 1.2s.3 1.2.8 1.2.8-.8.8-1.2-.3-1.2-.8-1.2z'/%3E%3C/svg%3E"); }
        .icon-goblin_mage { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 15h16'/%3E%3Cpath d='M6 15L10 3l8 12'/%3E%3Cpath d='M8 15v3c0 2 1 4 4 4s4-2 4-4v-3'/%3E%3Cpath d='M2 13l4 2-2 3'/%3E%3Cpath d='M22 13l-4 2 2 3'/%3E%3C/svg%3E"); }
        .icon-goblin_magic_knight { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'/%3E%3C/svg%3E"); }
        .icon-upgrade { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 12A10 10 0 1 1 22 12 10 10 0 1 1 2 12z'/%3E%3Cpath d='M12 16V8'/%3E%3Cpath d='M8 12l4-4 4 4'/%3E%3C/svg%3E"); }
        .icon-monolith { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Cpath d='M3 9h18'/%3E%3Cpath d='M9 21V9'/%3E%3C/svg%3E"); }
        .icon-boss_orc { -webkit-mask-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/%3E%3C/svg%3E"); }
      `}} />
    </div>
  );
                    }
