import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const teams = ['RCB', 'LSG', 'GT', 'KKR', 'SRH', 'DC', 'RR', 'PBKS', 'CSK', 'MI']

const teamInitialState = {
  MI: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  CSK: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  RCB: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  KKR: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  SRH: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  DC: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  RR: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  PBKS: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  LSG: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
  GT: { purse: 120, totalPlayers: 15, batters: 7, bowlers: 4, foreigners: 5 },
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
      else if (header === 'foreigner') player.foreigner = value.toLowerCase() === 'true'
      else if (header === 'type') player.type = value.toLowerCase()
      else if (header === 'value') player.value = Number(value)
    })
    players.push(player)
  }
  return players
}

export default function App() {
  const getSaved = (key, defaultValue) => {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
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
        if (player.foreigner) t.foreigners -= 1;
        if (player.type === 'batsman') t.batters -= 1;
        else if (player.type === 'bowler') t.bowlers -= 1;
        else if (player.type === 'all-rounder') {
          if (t.batters > 0) t.batters -= 1; if (t.bowlers > 0) t.bowlers -= 1;
        }
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
        if (p.foreigner) t.foreigners += 1;
        if (p.type === 'batsman') t.batters += 1;
        else if (p.type === 'bowler') t.bowlers += 1;
        else if (p.type === 'all-rounder') { t.batters += 1; t.bowlers += 1; }
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
      doc.text(`${team} (Spent: ₹${spent}Cr)`, 14, yPos);
      autoTable(doc, {
        startY: yPos + 2,
        head: [['Player', 'Type', 'Price']],
        body: squad.map(s => [s.player.name, s.player.type, `₹${s.price}Cr`]),
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
              <p style={{fontSize: '18px', color: '#bbb'}}>Base: ₹{currentPlayer.basePrice} Cr | Type: {currentPlayer.type}</p>
              <input 
                type="number" placeholder="Price (Cr)" value={price} 
                onChange={e => setPrice(e.target.value)} 
                style={{padding: '15px', width: '90%', margin: '20px 0', borderRadius: '8px', backgroundColor: '#222', color: 'white', border: '1px solid #444'}}
              />
              <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                {teams.map(t => (
                  <button key={t} onClick={() => {if(!price) return alert("Price?"); setPendingAssignment({player: currentPlayer, team: t, price: Number(price)}); setShowConfirmation(true);}}
                    style={{padding: '10px 15px', borderRadius: '6px', border: '1px solid #3498db', backgroundColor: 'transparent', color: '#3498db', fontWeight: 'bold', cursor: 'pointer'}}>
                    {t}
                  </button>
                ))}
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
              <h3 style={{margin: '0 0 10px 0', color: '#3498db'}}>{team} <span style={{fontSize: '12px', color: '#777'}}>({teamAssignments.length}/15)</span></h3>
              <div style={{fontSize: '14px', lineHeight: '1.8'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Purse:</span> <strong style={{color: '#2ecc71'}}>₹{(teamState[team].purse - spent).toFixed(2)}Cr</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Batters:</span> <strong>{teamState[team].batters}</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Bowlers:</span> <strong>{teamState[team].bowlers}</strong></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}><span>Foreign:</span> <strong>{teamState[team].foreigners}</strong></div>
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