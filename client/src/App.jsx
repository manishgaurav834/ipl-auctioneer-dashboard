import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ===== AUCTION CONFIGURATION VARIABLES =====
const INITIAL_PURSE = 120           // Budget per team in Crores
const TOTAL_PLAYER_SLOTS = 15       // Max players per team
const MIN_BATSMEN = 7               // Minimum batsmen required
const MIN_BOWLERS = 4               // Minimum bowlers required
const MAX_OVERSEAS = 5              // Maximum overseas players allowed
// ============================================

const teams = ['RCB', 'LSG', 'GT', 'KKR', 'SRH', 'DC', 'RR', 'PBKS', 'CSK', 'MI']

const teamInitialState = {
  MI: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  CSK: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  RCB: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  KKR: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  SRH: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  DC: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  RR: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  PBKS: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  LSG: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
  GT: { purse: INITIAL_PURSE, totalPlayers: TOTAL_PLAYER_SLOTS, batters: MIN_BATSMEN, bowlers: MIN_BOWLERS, overseas: MAX_OVERSEAS, totalValue: 0 },
}

function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const players = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = lines[i].split(',').map(v => v.trim())
    const player = {}
    headers.forEach((header, index) => {
      const value = values[index]
      if (header === 'name') player.name = value
      else if (header === 'baseprice') player.basePrice = Number(value)
      else if (header === 'overseas') player.overseas = value.toLowerCase() === 'true'
      else if (header === 'type') {
        let type = value.toLowerCase()
        // Convert 'batsman' to 'batter' for backwards compatibility
        if (type === 'batsman') type = 'batter'
        player.type = type
      }
      else if (header === 'value') player.value = Number(value)
    })
    players.push(player)
  }
  return players
}

export default function App() {
  const getSaved = (key, defaultValue) => {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    
    const parsed = JSON.parse(saved);
    
    // Migration: Convert old 'foreigners' property to 'overseas'
    if (key === 'teamState' && parsed) {
      for (let team in parsed) {
        if (parsed[team].foreigners !== undefined && parsed[team].overseas === undefined) {
          parsed[team].overseas = parsed[team].foreigners;
          delete parsed[team].foreigners;
        }
      }
    }
    
    return parsed;
  };

  const [auctionStarted, setAuctionStarted] = useState(() => getSaved('auctionStarted', false))
  const [players, setPlayers] = useState(() => getSaved('players', []))
  const [current, setCurrent] = useState(() => getSaved('current', 0))
  const [assignments, setAssignments] = useState(() => getSaved('assignments', []))
  const [teamState, setTeamState] = useState(() => getSaved('teamState', teamInitialState))
  const [price, setPrice] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [pendingAssignment, setPendingAssignment] = useState(null)

  useEffect(() => {
    localStorage.setItem('auctionStarted', JSON.stringify(auctionStarted));
    localStorage.setItem('players', JSON.stringify(players));
    localStorage.setItem('current', JSON.stringify(current));
    localStorage.setItem('assignments', JSON.stringify(assignments));
    localStorage.setItem('teamState', JSON.stringify(teamState));
  }, [auctionStarted, players, current, assignments, teamState]);

  const confirmAssignment = () => {
    if (!pendingAssignment) return;
    const { player, team, price: soldPrice } = pendingAssignment;
    const newAssignments = [...assignments, { player, team, price: soldPrice }];
    setAssignments(newAssignments);
    
    if (team !== 'Unsold') {
      setTeamState(prev => {
        const next = { ...prev }; const t = { ...next[team] };
        if (player.overseas) t.overseas -= 1;
        if (player.type === 'batter') t.batters -= 1;
        else if (player.type === 'bowler') t.bowlers -= 1;
        else if (player.type === 'all-rounder') {
          if (t.batters > 0) t.batters -= 1; if (t.bowlers > 0) t.bowlers -= 1;
        }
        t.totalValue += player.value;
        next[team] = t; return next;
      });
    }

    // REMOVE player from the active auction list since they are now assigned
    const remainingPlayers = [...players];
    remainingPlayers.splice(current, 1);
    setPlayers(remainingPlayers);

    setPrice(''); setShowConfirmation(false); setPendingAssignment(null);
    // Note: We don't increment 'current' anymore because the list itself is shrinking
  };

  const rollbackAction = (displayIndex) => {
    const actualIndex = assignments.length - 1 - displayIndex;
    const toUndo = assignments[actualIndex];

    if (!window.confirm(`Rollback ${toUndo.player.name}? They will return to the top of the auction.`)) return;

    // 1. Restore Budget/Slots
    if (toUndo.team !== 'Unsold') {
      setTeamState(prev => {
        const next = { ...prev };
        const t = { ...next[toUndo.team] };
        const p = toUndo.player;
        if (p.overseas) t.overseas += 1;
        if (p.type === 'batter') t.batters += 1;
        else if (p.type === 'bowler') t.bowlers += 1;
        else if (p.type === 'all-rounder') { t.batters += 1; t.bowlers += 1; }
        t.totalValue -= p.value;
        next[toUndo.team] = t;
        return next;
      });
    }

    // 2. Re-insert player into the available players list at the FRONT
    const restoredPlayers = [...players];
    restoredPlayers.splice(current, 0, toUndo.player); 
    setPlayers(restoredPlayers);

    // 3. Remove from history
    const updatedAssignments = [...assignments];
    updatedAssignments.splice(actualIndex, 1);
    setAssignments(updatedAssignments);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.text("IPL Auction Summary", 14, 15);
    let yPos = 25;
    teams.forEach(team => {
      const squad = assignments.filter(a => a.team === team);
      const spent = squad.reduce((s, a) => s + a.price, 0);
      const totalValue = squad.reduce((s, a) => s + a.player.value, 0);
      doc.text(`${team} (Squad Size: ${squad.length}/${TOTAL_PLAYER_SLOTS} | Spent: Rs.${spent}Cr | Total Value: ${totalValue})`, 14, yPos);
      autoTable(doc, {
        startY: yPos + 2,
        head: [['#', 'Player', 'Type', 'Price', 'Value', 'Overseas']],
        body: squad.map((s, index) => [index + 1, s.player.name, s.player.type, `Rs.${s.price}Cr`, s.player.value, s.player.overseas ? 'Yes' : 'No']),
      });
      yPos = doc.lastAutoTable.finalY + 10;
    });
    doc.save("Auction_Results.pdf");
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseCSV(event.target.result);
        setPlayers(parsed); setAuctionStarted(true);
        setCurrent(0); setAssignments([]); setTeamState(teamInitialState);
      } catch (err) { setUploadError("Invalid CSV Format"); }
    };
    reader.readAsText(file);
  };

  if (!auctionStarted) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', padding: '100px', textAlign: 'center'}}>
        <div style={{maxWidth: '500px', margin: 'auto', border: '1px solid #333', padding: '30px', borderRadius: '15px', backgroundColor: '#161616'}}>
          <h1>IPL Auction Dashboard</h1>
          <input type="file" accept=".csv" onChange={handleCSVUpload} style={{marginTop: '20px'}} />
        </div>
      </div>
    );
  }

  const currentPlayer = players[current];

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', padding: '10px 1.5%', fontFamily: 'Inter, sans-serif'}}>
      <div style={{display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap'}}>
        
        {/* LEFT: ACTIVE BIDDING */}
        <div style={{flex: '1', minWidth: '400px'}}>
          <h2 style={{color: '#3498db', marginBottom: '15px'}}>Active Bidding</h2>
          {currentPlayer ? (
            <div style={{border: '1px solid #3498db', padding: '25px', borderRadius: '12px', backgroundColor: '#141414'}}>
              <h1 style={{margin: '0 0 10px 0', fontSize: '36px'}}>{currentPlayer.name}</h1>
              <p style={{fontSize: '18px', color: '#bbb'}}>Base: ₹{currentPlayer.basePrice} Cr | Type: {currentPlayer.type} | {currentPlayer.overseas ? '🌍 Overseas' : '🏠 Domestic'}</p>
              <p style={{fontSize: '16px', color: '#f39c12', marginBottom: '15px'}}>Player Value: <strong>{currentPlayer.value}</strong></p>
              <input 
                type="number" placeholder="Price (Cr)" value={price} 
                onChange={e => setPrice(e.target.value)} 
                style={{padding: '15px', width: '90%', margin: '20px 0', borderRadius: '8px', backgroundColor: '#222', color: 'white', border: '1px solid #444'}}
              />
              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                {teams.map(t => {
                  const bidPrice = Number(price);
                  const teamAssignments = assignments.filter(a => a.team === t);
                  const spent = teamAssignments.reduce((s, a) => s + a.price, 0);
                  const remainingBudget = teamState[t].purse - spent;
                  const canAfford = bidPrice <= remainingBudget;
                  
                  const canAddOverseas = !currentPlayer.overseas || teamState[t].overseas > 0;
                  
                  // Check if team has reached player quota
                  const quotaFulfilled = teamAssignments.length >= TOTAL_PLAYER_SLOTS;
                  
                  // Count current players by type
                  const battersBought = teamAssignments.filter(a => a.player.type === 'batter').length;
                  const bowlersBought = teamAssignments.filter(a => a.player.type === 'bowler').length;
                  const allrounders = teamAssignments.filter(a => a.player.type === 'all-rounder').length;
                  const totalBought = teamAssignments.length;
                  
                  // Check if adding this player violates the minimum requirements
                  let canMeetMinimums = true;
                  let minimumError = '';
                  
                  const slotsAfterThisPlayer = TOTAL_PLAYER_SLOTS - (totalBought + 1);
                  
                  if (currentPlayer.type === 'batter') {
                    // When buying a batter, check if remaining slots are enough for bowlers still needed
                    const bowlersDeficiency = Math.max(0, MIN_BOWLERS - (bowlersBought + allrounders));
                    if (bowlersDeficiency > slotsAfterThisPlayer) {
                      canMeetMinimums = false;
                      minimumError = `❌ Cannot Meet Minimums!\nAfter buying this batter, you'll have room for only ${slotsAfterThisPlayer} more players.\nYou still need ${bowlersDeficiency} more bowlers.`;
                    }
                  } else if (currentPlayer.type === 'bowler') {
                    // When buying a bowler, check if remaining slots are enough for batsmen still needed
                    const batsmenDeficiency = Math.max(0, MIN_BATSMEN - (battersBought + allrounders));
                    if (batsmenDeficiency > slotsAfterThisPlayer) {
                      canMeetMinimums = false;
                      minimumError = `❌ Cannot Meet Minimums!\nAfter buying this bowler, you'll have room for only ${slotsAfterThisPlayer} more players.\nYou still need ${batsmenDeficiency} more batsmen.`;
                    }
                  } else if (currentPlayer.type === 'all-rounder') {
                    // When buying an all-rounder, it helps both requirements
                    const batsmenDeficiency = Math.max(0, MIN_BATSMEN - (battersBought + allrounders + 1));
                    const bowlersDeficiency = Math.max(0, MIN_BOWLERS - (bowlersBought + allrounders + 1));
                    if (batsmenDeficiency + bowlersDeficiency > slotsAfterThisPlayer) {
                      canMeetMinimums = false;
                      minimumError = `❌ Cannot Meet Minimums!\nAfter buying this all-rounder, you'll have room for only ${slotsAfterThisPlayer} more players.\nYou still need ${batsmenDeficiency} batsmen and ${bowlersDeficiency} bowlers.`;
                    }
                  }
                  
                  const canBid = canAfford && canAddOverseas && canMeetMinimums && !quotaFulfilled;
                  
                  return (
                    <button key={t} onClick={() => {
                      if(!price) return alert("Price?");
                      if(quotaFulfilled) return alert(`❌ Squad Complete!\n${t} has already signed ${TOTAL_PLAYER_SLOTS} players.\nTheir squad is now full and cannot accept any more players.`);
                      if(!canAfford) return alert(`❌ Insufficient Budget!\n${t} has only ₹${remainingBudget}Cr left\nYou bid: ₹${bidPrice}Cr`);
                      if(!canAddOverseas) return alert(`❌ Overseas Limit Exceeded!\n${t} can have maximum ${MAX_OVERSEAS} overseas players\nThey've already reached the limit.`);
                      if(!canMeetMinimums) return alert(minimumError);
                      setPendingAssignment({player: currentPlayer, team: t, price: bidPrice}); 
                      setShowConfirmation(true);
                    }}
                      style={{padding: '10px 15px', borderRadius: '6px', border: canBid ? '1px solid #3498db' : '1px solid #e74c3c', backgroundColor: 'transparent', color: canBid ? '#3498db' : '#e74c3c', fontWeight: 'bold', cursor: canBid ? 'pointer' : 'not-allowed', opacity: canBid ? 1 : 0.5}}>
                      {t}
                    </button>
                  );
                })}
                <button onClick={() => {setPendingAssignment({player: currentPlayer, team: 'Unsold', price: 0}); setShowConfirmation(true)}}
                  style={{padding: '10px 15px', borderRadius: '6px', backgroundColor: '#444', color: 'white', width: '100%', marginTop: '10px'}}>
                  Mark Unsold
                </button>
              </div>
            </div>
          ) : <div style={{padding: '50px', background: '#111', borderRadius: '12px', textAlign: 'center'}}><h2>✅ Auction Pool Empty</h2></div>}
          
          <div style={{marginTop: '20px', display: 'flex', gap: '10px'}}>
            <button onClick={downloadPDF} style={{flex: 1, padding: '15px', background: '#27ae60', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer'}}>📥 Download PDF</button>
            <button onClick={() => {if(window.confirm("Reset?")) {localStorage.clear(); window.location.reload();}}} style={{flex: 1, padding: '15px', background: '#c0392b', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer'}}>🔄 Reset</button>
          </div>
        </div>

        {/* RIGHT: AUCTION LOG */}
        <div style={{flex: '1.3', minWidth: '400px', display: 'flex', flexDirection: 'column'}}>
          <h2 style={{color: '#3498db', marginBottom: '15px'}}>Auction Log</h2>
          <div style={{flexGrow: 1, maxHeight: '500px', overflowY: 'auto', border: '1px solid #222', borderRadius: '12px', backgroundColor: '#141414'}}>
            <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
              <thead style={{position: 'sticky', top: 0, backgroundColor: '#1c1c1c', borderBottom: '2px solid #333'}}>
                <tr><th style={{padding: '15px'}}>Player</th><th style={{padding: '15px'}}>Team</th><th style={{padding: '15px'}}>Price</th><th style={{padding: '15px'}}>Action</th></tr>
              </thead>
              <tbody>
                {[...assignments].reverse().map((a, i) => (
                  <tr key={i} style={{borderBottom: '1px solid #1f1f1f'}}>
                    <td style={{padding: '15px'}}>{a.player.name}</td>
                    <td style={{padding: '15px', color: '#3498db', fontWeight: 'bold'}}>{a.team}</td>
                    <td style={{padding: '15px', color: '#2ecc71'}}>₹{a.price} Cr</td>
                    <td style={{padding: '15px'}}>
                      <button onClick={() => rollbackAction(i)} style={{background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer'}}>Rollback</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* BOTTOM: TEAM CARDS */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px'}}>
        {teams.map(team => {
          const teamAssignments = assignments.filter(a => a.team === team);
          const spent = teamAssignments.reduce((s, a) => s + a.price, 0);
          return (
            <div key={team} style={{border: '1px solid #222', padding: '20px', borderRadius: '12px', backgroundColor: '#141414'}}>
              <h3 style={{margin: '0 0 10px 0', color: '#3498db'}}>{team} <span style={{fontSize: '12px', color: '#777'}}>({teamAssignments.length}/{TOTAL_PLAYER_SLOTS})</span></h3>
              <div style={{fontSize: '14px', lineHeight: '1.8'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Purse Left:</span> <strong style={{color: '#2ecc71'}}>₹{(teamState[team].purse - spent).toFixed(2)}Cr</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Total Value:</span> <strong style={{color: '#f39c12'}}>{teamState[team].totalValue}</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Batters Needed:</span> <strong>{Math.max(0, teamState[team].batters)}</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Bowlers Needed:</span> <strong>{Math.max(0, teamState[team].bowlers)}</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Overseas Left:</span> <strong>{Math.max(0, teamState[team].overseas)}</strong></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* CONFIRMATION MODAL */}
      {showConfirmation && pendingAssignment && (
        <div style={{position: 'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000}}>
          <div style={{background:'#1c1c1c', padding:'40px', borderRadius:'15px', border: '1px solid #3498db', textAlign: 'center'}}>
            <h2 style={{color: '#3498db'}}>{pendingAssignment.player?.name}</h2>
            <p style={{fontSize: '20px'}}>Sold to {pendingAssignment.team} for ₹{pendingAssignment.price} Cr</p>
            <div style={{marginTop: '30px', display: 'flex', gap: '15px', justifyContent: 'center'}}>
              <button onClick={confirmAssignment} style={{background: '#2ecc71', color: 'white', padding: '12px 30px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>Confirm</button>
              <button onClick={() => {setShowConfirmation(false); setPendingAssignment(null);}} style={{background: '#e74c3c', color: 'white', padding: '12px 30px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}