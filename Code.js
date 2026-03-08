function runTournament() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    SpreadsheetApp.getUi().alert("Another process is currently running. Please wait a moment and try again.");
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- CONFIG ---
    const checkinSheetName = "Check-in";
    const settingsSheetName = "Settings";
    const dataSheetName = "Hidden_TournamentData";
    const activeRoundName = "Current Round";
    
    // 1. GET SETTINGS
    const settingsSheet = ss.getSheetByName(settingsSheetName);
    if (!settingsSheet) {
      SpreadsheetApp.getUi().alert(`Error: Missing sheet named "${settingsSheetName}".`);
      return;
    }
    
    let numLanes = parseInt(settingsSheet.getRange("B1").getValue());
    if (!numLanes || isNaN(numLanes) || numLanes < 1) numLanes = 4;

    let safeCount = parseInt(settingsSheet.getRange("B2").getValue());
    if (!safeCount || isNaN(safeCount) || safeCount < 1) safeCount = 2; 

    // 2. INITIALIZATION
    let dataSheet = ss.getSheetByName(dataSheetName);
    
    if (!dataSheet) {
      const ui = SpreadsheetApp.getUi();
      if (ui.alert('Start New Tournament?', 'Clear previous data?', ui.ButtonSet.YES_NO) == ui.Button.NO) return;
      
      dataSheet = ss.insertSheet(dataSheetName);
      dataSheet.hideSheet(); 
      dataSheet.appendRow(["Name", "Lives", "Status", "RoundOut", "1st", "2nd", "3rd", "4th"]); 
      
      const checkinSheet = ss.getSheetByName(checkinSheetName);
      if (!checkinSheet) {
        ui.alert(`Error: Missing sheet named "${checkinSheetName}".`);
        return;
      }

      const lastRow = checkinSheet.getLastRow();
      const rawData = checkinSheet.getRange("A2:C" + lastRow).getValues();
      
      const names = rawData.map(row => {
        let name = row[0];       
        let num = row[1];        
        let passed = row[2];     
        if (!name || !num || passed !== true) return ""; 
        return `#${num} - ${name}`;
      }).filter(String);

      if (names.length < numLanes) {
        ui.alert(`Error: Only ${names.length} racers ready. Need ${numLanes}.`);
        ss.deleteSheet(dataSheet); 
        return;
      }
      
      let roster = names.map(name => [name, 2, "Main Bracket", "", 0, 0, 0, 0]);
      dataSheet.getRange(2, 1, roster.length, 8).setValues(roster);
      
      ss.getSheets().forEach(s => {
        if (s.getName().startsWith("Completed Round") || s.getName() === "Current Round") {
           ss.deleteSheet(s);
        }
      });
      
      generateNextRound(ss, dataSheet, numLanes, safeCount);
      return;
    }
    
    // 3. PROCESS RESULTS
    const activeSheet = ss.getSheetByName(activeRoundName);
    if (activeSheet) {
      let roundTitle = activeSheet.getRange("A1").getValue().toString();
      let isGrandFinal = roundTitle.includes("CHAMPIONSHIP");

      const success = processRoundResults(ss, activeSheet, dataSheet, numLanes, safeCount);
      if (!success) return; 
      
      const roundNum = activeSheet.getRange("A1").getValue().replace("Round ", "");
      
      let baseName = "Completed Round " + roundNum;
      let finalName = baseName;
      let counter = 1;
      while (ss.getSheetByName(finalName)) {
         finalName = baseName + " (" + counter + ")";
         counter++;
      }
      
      activeSheet.setName(finalName);
      activeSheet.setTabColor("#999999"); 
      
      if (isGrandFinal) {
        showPodium(activeSheet, numLanes); 
        return; 
      }
    }
    
    // 4. GENERATE NEXT
    generateNextRound(ss, dataSheet, numLanes, safeCount);

  } finally {
    lock.releaseLock();
  }
}

function processRoundResults(ss, roundSheet, dataSheet, numLanes, safeCount) {
  const lastRow = roundSheet.getLastRow();
  if (lastRow < 3) return true; 
  
  const totalCols = (numLanes * 2) + 1;
  const values = roundSheet.getRange(3, 1, lastRow - 2, totalCols).getValues();
  
  let roundStr = roundSheet.getRange("A1").getValue();
  let roundNum = parseInt(roundStr.replace("Round ", "").replace("Completed Round ", "")) || 0;

  const dataRange = dataSheet.getDataRange();
  const rosterValues = dataRange.getValues(); 
  let rosterMap = new Map();
  
  for (let i = 1; i < rosterValues.length; i++) {
    rosterMap.set(rosterValues[i][0], i); 
  }
  
  for (let i = 0; i < values.length; i++) {
    let row = values[i];
    
    if (!row[1] || row[1] === "" || row[0] === "Heat") continue;
    
    let validRacers = [];
    for (let lane = 0; lane < numLanes; lane++) {
      let nameIdx = 1 + (lane * 2);
      let posIdx = 2 + (lane * 2);
      let pName = row[nameIdx];
      let pPos = row[posIdx];
      
      // Completely skips processing for anyone explicitly marked with a BYE
      if (pName && pName !== "" && pPos !== "BYE") {
        validRacers.push({name: pName, place: pPos});
      }
    }
    
    if (validRacers.length === 0) continue;

    for (let racer of validRacers) {
      if (racer.place === "" || isNaN(racer.place)) {
        SpreadsheetApp.getUi().alert(`Missing or invalid placement for ${racer.name} in Heat ${row[0]}.`);
        return false;
      }
    }
    
    let safeRank = safeCount; 
    let roundTitle = roundSheet.getRange("A1").getValue();
    let isChampionship = roundTitle.includes("CHAMPIONSHIP");

    if (validRacers.length > 1 && validRacers.length <= safeRank) {
       safeRank = validRacers.length - 1; 
    }

    if (isChampionship || (validRacers.length === 2 && isChampionshipMatch(rosterValues, rosterMap, validRacers))) {
       safeRank = 1; 
    }

    for (let racer of validRacers) {
      let rIndex = rosterMap.get(racer.name);
      if (rIndex === undefined) continue; 
      
      let place = parseInt(racer.place);
      if (place >= 1 && place <= 4) {
         rosterValues[rIndex][3 + place] = (rosterValues[rIndex][3 + place] || 0) + 1; 
      }

      let currentLives = rosterValues[rIndex][1];
      let newLives = currentLives;
      if (place > safeRank) {
        newLives = newLives - 1;
      }
      
      rosterValues[rIndex][1] = newLives;
      
      let newStatus = "";
      if (newLives === 2) newStatus = "Main Bracket";
      if (newLives === 1) newStatus = "Second Chance Bracket";
      if (newLives <= 0) {
        newStatus = "Eliminated";
        if (currentLives > 0) {
           rosterValues[rIndex][3] = roundNum; 
        }
      }
      rosterValues[rIndex][2] = newStatus;
    }
  }
  
  dataRange.setValues(rosterValues);
  return true;
}

function isChampionshipMatch(rosterValues, map, racers) {
  let p1Lives = rosterValues[map.get(racers[0].name)][1];
  let p2Lives = rosterValues[map.get(racers[1].name)][1];
  return (p1Lives !== p2Lives); 
}

function generateNextRound(ss, dataSheet, numLanes, safeCount) {
  const roster = dataSheet.getDataRange().getValues().slice(1); 
  
  let winnersBracket = roster.filter(r => r[1] === 2).map(r => r[0]);
  let losersBracket = roster.filter(r => r[1] === 1).map(r => r[0]);
  
  let totalSurvivors = winnersBracket.length + losersBracket.length;
  
  if (totalSurvivors <= 1) {
     forceShowPodium(numLanes); 
     return;
  }
  
  let roundNum = 1;
  ss.getSheets().forEach(s => { if (s.getName().includes("Completed Round")) roundNum++; });
  
  let newSheet = ss.insertSheet("Current Round");
  let roundTitle = `Round ${roundNum}`;
  newSheet.getRange("A1").setValue(roundTitle);
  
  let headerRow = ["Heat"];
  for (let l = 1; l <= numLanes; l++) {
    headerRow.push(`L${l} Car`, `Pos`);
  }
  
  let scheduleData = [headerRow];
  let heatCount = 1;
  let spacerRow = new Array((numLanes * 2) + 1).fill("");
  let instructionLines = [];
  
  if (totalSurvivors <= numLanes) {
    // TRIGGER GRAND FINAL
    let titleRow = [...spacerRow]; titleRow[0] = "CHAMPIONSHIP FINAL";
    scheduleData.push(titleRow);
    
    let finalHeat = createHeats(winnersBracket.concat(losersBracket), heatCount, true, numLanes, safeCount);
    scheduleData = scheduleData.concat(finalHeat.data);
    newSheet.getRange("A1").setValue(`🏆 CHAMPIONSHIP ROUND 🏆`);
    
    instructionLines = [
      "🏆 GRAND FINAL INSTRUCTIONS:",
      "1. All remaining cars race.",
      "2. Enter final positions (1, 2, 3...).",
      "3. Click 'Run' one last time to see the Podium!"
    ];
    
  } else {
    // GENERATE MAIN BRACKET
    if (winnersBracket.length > 0) {
      let titleRow = [...spacerRow]; titleRow[0] = "MAIN BRACKET";
      scheduleData.push(titleRow);

      // THE NEW LOGIC: Freeze the Main Bracket if it is equal to or below the safe count
      if (winnersBracket.length <= safeCount) {
        let holdRow = [heatCount];
        for (let i = 0; i < numLanes; i++) {
          if (i < winnersBracket.length) {
            holdRow.push(winnersBracket[i], "BYE");
          } else {
            holdRow.push("", "");
          }
        }
        scheduleData.push(holdRow);
        heatCount++;
      } else {
        let wbHeats = createHeats(winnersBracket, heatCount, false, numLanes, safeCount);
        scheduleData = scheduleData.concat(wbHeats.data);
        heatCount = wbHeats.nextHeat;
      }
    }
    
    // GENERATE SECOND CHANCE BRACKET
    if (losersBracket.length > 0) {
      let titleRow = [...spacerRow]; titleRow[0] = "SECOND CHANCE BRACKET";
      scheduleData.push(titleRow);
      let lbHeats = createHeats(losersBracket, heatCount, false, numLanes, safeCount);
      scheduleData = scheduleData.concat(lbHeats.data);
      heatCount = lbHeats.nextHeat;
    }
    
    instructionLines = [
      "INSTRUCTIONS:",
      "1. Enter Place (1, 2, 3...).",
      `2. Top ${safeCount} Safe (unless heat size is smaller).`,
      "3. Others lose a life."
    ];
  }
  
  // --- VISUAL FORMATTING ---
  if (scheduleData.length > 1) {
    const totalCols = (numLanes * 2) + 1;
    const rows = scheduleData.length;
    
    const range = newSheet.getRange(2, 1, rows, totalCols);
    range.setValues(scheduleData);
    
    let roundTitleRange = newSheet.getRange(1, 1, 1, totalCols);
    roundTitleRange.merge()
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle")
                   .setFontSize(24)
                   .setFontWeight("bold")
                   .setBackground("#1F3A4D")
                   .setFontColor("white");
                   
    if (newSheet.getRange("A1").getValue().toString().includes("CHAMPIONSHIP")) {
        roundTitleRange.setBackground("#cc0000"); 
    }

    newSheet.setRowHeights(2, rows, 55); 
    range.setFontFamily("Arial").setFontSize(14).setVerticalAlignment("middle").setHorizontalAlignment("center");
    
    let headerRange = newSheet.getRange(2, 1, 1, totalCols);
    headerRange.setBackground("#1F3A4D").setFontColor("white").setFontWeight("bold").setFontSize(18);
    
    newSheet.setColumnWidth(1, 80); 
    newSheet.getRange(3, 1, rows - 1, 1).setFontWeight("bold").setBackground("#EFEFEF"); 

    for (let l = 0; l < numLanes; l++) {
      let nameCol = 2 + (l * 2);
      let posCol = 3 + (l * 2);
      
      newSheet.setColumnWidth(nameCol, 200); 
      let nameRange = newSheet.getRange(3, nameCol, rows - 1, 1);
      nameRange.setFontWeight("bold").setWrap(true);
      nameRange.setBorder(true, null, true, null, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
      
      newSheet.setColumnWidth(posCol, 60);
      let posRange = newSheet.getRange(3, posCol, rows - 1, 1);
      posRange.setBackground("#F1F1F1").setFontWeight("bold")
              .setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
      posRange.setBorder(null, null, null, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    for (let i = 0; i < scheduleData.length; i++) {
      let rowIdx = i + 2; 
      let text = scheduleData[i][0].toString();
      
      if (text.includes("BRACKET") || text.includes("FINAL")) {
        newSheet.getRange(rowIdx, 1, 1, totalCols)
                .setBackground("#6DD47E").setFontColor("#1F3A4D") 
                .setFontWeight("bold").setFontSize(20).merge();
      }
      if (scheduleData[i][2] === "BYE") {
        newSheet.getRange(rowIdx, 1, 1, totalCols).setBackground("#FCFCFC").setFontColor("#CCCCCC");
      }
    }

    let startRow = scheduleData.length + 4;
    for (let i = 0; i < instructionLines.length; i++) {
      let cell = newSheet.getRange(startRow + i, 1);
      cell.setValue(instructionLines[i]).setFontSize(12);
      if (i === 0) cell.setFontWeight("bold").setFontSize(14);
    }
  } else {
    newSheet.getRange(3,1).setValue("Waiting for results...");
  }
}

// --- UPDATED PODIUM WITH CHIP STATS ---
function showPodium(sheet, numLanes) {
  let maxCols = sheet.getLastColumn();
  let row = sheet.getRange(4, 1, 1, maxCols).getValues()[0];
  
  if (!row || row[0] === "") {
     row = sheet.getRange(5, 1, 1, maxCols).getValues()[0]; 
     if (!row || row[0] === "" || row[0].toString().includes("BRACKET")) {
         SpreadsheetApp.getUi().alert("Could not find Final Race results.");
         return;
     }
  }
  
  let results = [];
  for (let l = 0; l < (maxCols - 1) / 2; l++) {
     let nameIdx = 1 + (l*2);
     let posIdx = 2 + (l*2);
     if (row[nameIdx] && row[posIdx] !== "BYE") {
       results.push({name: row[nameIdx], place: row[posIdx]});
     }
  }
  
  results.sort((a, b) => a.place - b.place);
  
  let dataSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Hidden_TournamentData");
  if (dataSheet) {
     let data = dataSheet.getDataRange().getValues(); 
     let eliminated = [];

     for (let i=1; i<data.length; i++) {
        let name = data[i][0];
        let rOut = data[i][3] || 0; 
        
        let stats = {
          firsts: data[i][4],
          seconds: data[i][5],
          thirds: data[i][6]
        };

        let winner = results.find(r => r.name === name);
        if (winner) {
           winner.stats = stats;
        } else {
           eliminated.push({name: name, roundOut: rOut, stats: stats});
        }
     }
     
     eliminated.sort((a, b) => b.roundOut - a.roundOut);
     while (results.length < 4 && eliminated.length > 0) {
        let next = eliminated.shift();
        results.push({name: next.name, place: results.length + 1, stats: next.stats});
     }
  }

  function getStatHtml(stats) {
    if (!stats) return "";
    return `
      <div class="stat-container">
        <span class="chip chip-gold">${stats.firsts}x 🥇</span>
        <span class="chip chip-silver">${stats.seconds}x 🥈</span>
        <span class="chip chip-bronze">${stats.thirds}x 🥉</span>
      </div>
    `;
  }

  let html = `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; text-align: center; background-color: #f4f4f4; padding: 20px; }
          .container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
          h1 { color: #1F3A4D; margin-bottom: 20px; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
          .rank { display: flex; align-items: center; justify-content: flex-start; margin: 15px 0; padding: 15px 25px; border-radius: 10px; }
          .gold { background: #fff8e1; border: 2px solid #FFD700; color: #b8860b; }
          .silver { background: #f7f7f7; border: 2px solid #C0C0C0; color: #7f7f7f; }
          .bronze { background: #fff0e0; border: 2px solid #CD7F32; color: #8b4513; }
          .normal { background: #ffffff; border: 1px solid #ddd; color: #555; }
          .medal { font-size: 42px; margin-right: 25px; }
          .info { display: flex; flex-direction: column; align-items: center; text-align: center; flex-grow: 1; }
          .name { display: block; font-size: 26px; font-weight: bold; margin-bottom: 8px; }
          .stat-container { display: flex; justify-content: center; gap: 10px; }
          .chip { display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 20px; font-size: 16px; font-weight: bold; color: #444; box-shadow: 0 2px 4px rgba(0,0,0,0.1); background: white; border: 1px solid #ccc;}
          .chip-gold { background: #FFF7D1; border-color: #E6C300; color: #8A6D00; }
          .chip-silver { background: #F0F0F0; border-color: #BBBBBB; color: #666666; }
          .chip-bronze { background: #FFE8D6; border-color: #D98D58; color: #8B4513; }
          button { margin-top: 25px; padding: 12px 24px; font-size: 18px; background: #1F3A4D; color: white; border: none; border-radius: 5px; cursor: pointer; }
          button:hover { background: #132430; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏆 OFFICIAL RESULTS 🏆</h1>
          ${results[0] ? `<div class="rank gold"><span class="medal">🥇</span><div class="info"><span class="name">${results[0].name}</span>${getStatHtml(results[0].stats)}</div></div>` : ''}
          ${results[1] ? `<div class="rank silver"><span class="medal">🥈</span><div class="info"><span class="name">${results[1].name}</span>${getStatHtml(results[1].stats)}</div></div>` : ''}
          ${results[2] ? `<div class="rank bronze"><span class="medal">🥉</span><div class="info"><span class="name">${results[2].name}</span>${getStatHtml(results[2].stats)}</div></div>` : ''}
          ${results[3] ? `<div class="rank normal"><span class="medal">4️⃣</span><div class="info"><span class="name">${results[3].name}</span>${getStatHtml(results[3].stats)}</div></div>` : ''}
          <button onclick="google.script.host.close()">Close Podium</button>
        </div>
      </body>
    </html>
  `;

  let htmlOutput = HtmlService.createHtmlOutput(html).setWidth(550).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, ' ');
}

function forceShowPodium(numLanes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheets = ss.getSheets();
  let roundSheets = sheets.filter(s => s.getName().includes("Completed Round"));
  
  roundSheets.sort((a, b) => {
    let numA = parseInt(a.getName().replace("Completed Round ", ""));
    let numB = parseInt(b.getName().replace("Completed Round ", ""));
    return numB - numA; 
  });
  
  if (roundSheets.length > 0) {
    showPodium(roundSheets[0], numLanes);
  } else {
    SpreadsheetApp.getUi().alert("No completed rounds found.");
  }
}

function createHeats(names, startHeat, isFinal, numLanes, safeCount) {
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  
  let rows = [];
  let currentHeat = startHeat;
  let safetyCounter = 0; 
  
  while (names.length > 0) {
    safetyCounter++;
    if (safetyCounter > 500) break; 

    let count = names.length;
    let numHeats = Math.ceil(count / numLanes);
    if (numHeats < 1) numHeats = 1;

    let take = Math.ceil(count / numHeats);
    if (take < 1) take = 1; 

    let racers = names.splice(0, take);
    while (racers.length < numLanes) racers.push("");
    
    let isBye = (!isFinal && take === 1);
    
    let row = [currentHeat];
    for (let r of racers) {
       row.push(r);
       row.push(isBye ? "BYE" : "");
    }
    
    rows.push(row);
    currentHeat++;
  }
  return {data: rows, nextHeat: currentHeat};
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏁 Pinewood Admin')
      .addItem('🛠️ Initialize Setup', 'initializeSetup')
      .addSeparator()
      .addItem('▶ Run / Next Round', 'runTournament')
      .addSeparator()
      .addItem('❌ Reset Whole Tournament', 'resetWholeTournament')
      .addToUi();
}

function resetWholeTournament() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (SpreadsheetApp.getUi().alert('Reset ALL?', 'This will wipe the entire tournament. Are you sure?', SpreadsheetApp.getUi().ButtonSet.YES_NO) == SpreadsheetApp.getUi().Button.NO) return;
  
  ss.getSheets().forEach(s => {
    let name = s.getName();
    if (name.startsWith("Completed Round") || name === "Current Round" || name === "Hidden_TournamentData") {
       ss.deleteSheet(s);
    }
  });
}

function initializeSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Create Settings Sheet
  let settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("Settings");
    
    // Set headers and default values
    const settingsData = [
      ["Setting", "Value", "Description"],
      ["Number of Lanes", 4, "How many lanes does your track have?"],
      ["Number to Advance", 2, "How many cars advance to the next round from each heat?"]
    ];
    settingsSheet.getRange(1, 1, 3, 3).setValues(settingsData);
    
    // Formatting
    const headerRange = settingsSheet.getRange("A1:C1");
    headerRange.setFontWeight("bold").setBackground("#1F3A4D").setFontColor("white");
    settingsSheet.setFrozenRows(1);
    settingsSheet.autoResizeColumns(1, 3);
  }
  
  // 2. Create Check-in Sheet
  let checkinSheet = ss.getSheetByName("Check-in");
  if (!checkinSheet) {
    checkinSheet = ss.insertSheet("Check-in");
    
    // Set headers and sample data
    const checkinData = [
      ["Racer Name", "Car Number", "Passed Inspection"],
      ["Example Racer", 101, true] // Sample racer
    ];
    checkinSheet.getRange(1, 1, 2, 3).setValues(checkinData);
    
    // Add Checkboxes to Column C (Passed Inspection) starting from Row 2
    const checkboxRange = checkinSheet.getRange("C2:C1000"); 
    checkboxRange.insertCheckboxes();
    
    // Formatting
    const headerRange = checkinSheet.getRange("A1:C1");
    headerRange.setFontWeight("bold").setBackground("#1F3A4D").setFontColor("white");
    checkinSheet.setFrozenRows(1);
    checkinSheet.autoResizeColumns(1, 3);
  }
  
  // 3. Delete 'Sheet1' if it exists and is empty
  const defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert("Setup Initialized! 'Settings' and 'Check-in' sheets are ready.");
}