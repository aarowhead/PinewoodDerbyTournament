# Pinewood Derby Tournament Manager

A free, simple, and powerful Google Sheets and Google Apps Script solution for running a Double-Elimination Pinewood Derby tournament. 

## What is this?
Running a Pinewood Derby can be chaotic. Tracking who races when, who has been eliminated, and who makes it to the finals is difficult to manage on paper. 

This project provides a fully automated **Double-Elimination Bracket** system built directly into a Google Sheet. It handles:
- **Check-in:** Track which cars have passed inspection and are ready to race.
- **Dynamic Heats:** Automatically generates randomized heats based on the number of lanes on your track.
- **Bracket Tracking:** Automatically manages a "Main Bracket" (for undefeated cars) and a "Second Chance Bracket" (for cars with one loss).
- **The Grand Final:** Automatically triggers a final championship race when the field is narrowed down, culminating in an interactive Podium display.

This is designed to be completely free, requiring no special software downloads—just a Google account.

## Features
*   **Free Pinewood Derby Software:** No subscriptions, no software to install, runs entirely in the cloud.
*   **Automated Racing Bracket:** Automatically generates random heats based on your specific track size (supports 2, 3, 4, 5, 6+ lanes).
*   **Double-Elimination System:** Ensures fairness by giving every racer at least two chances to race before being eliminated.
*   **Live Check-in System:** Built-in tools for tracking car inspection and registration on race day.
*   **Interactive Podium:** Generates a visually appealing, auto-calculated final podium for your winners.
*   **Open Source:** Built on Google Apps Script, meaning you can view, tweak, and customize the code to fit your exact pack or den rules.

---

## How It Works
This system uses a **lives-based double elimination** format:
1. Every car starts with **2 lives**.
2. For each heat, you enter the finish positions (1st, 2nd, 3rd, etc.).
3. Based on your settings, a certain number of cars "advance" safely, while the bottom cars lose a life.
   * *Example: On a 4-lane track, you might set it so the top 2 advance, and the bottom 2 lose a life.*
4. If a car drops to 1 life, they move to the "Second Chance Bracket." If they hit 0 lives, they are eliminated.
5. The tournament continues generating rounds until only enough cars remain to fit in one final championship race.

---

## Step-by-Step Setup Guide

### Part 1: Installing the Script
Because this relies on Google Apps Script, you need to attach the code to a new Google Sheet.

1. Create a new, blank Google Sheet at [sheets.new](https://sheets.new).
2. Name the sheet something like "Pack 123 Pinewood Derby 2026".
3. In the top menu, click **Extensions > Apps Script**.
4. A new tab will open with the Apps Script editor. Delete any code currently in the `Code.gs` file.
5. Copy all the text from the `Code.js` file in this repository and paste it into the editor.
6. Click the **Save** icon (the floppy disk) at the top.
7. Close the Apps Script tab and return to your Google Sheet.
8. Refresh the Google Sheet page. After a few seconds, you should see a new menu item at the top called **🏁 Pinewood Admin**.

### Part 2: Initializing the Workbook
1. Click on the **🏁 Pinewood Admin** menu.
2. Select **🛠️ Initialize Setup**.
3. *Note: The first time you run any script in a Google Sheet, Google will ask for permission to run it. Click "Continue", choose your Google account, click "Advanced", and click "Go to [Project Name] (unsafe)". Finally, click "Allow".*
4. Run **🛠️ Initialize Setup** one more time if it didn't complete.
5. The script will automatically build two new tabs at the bottom: **Settings** and **Check-in**.

### Part 3: Configuration & Check-in
1. Go to the **Settings** tab.
   - **Number of Lanes:** Set this to match your physical track (e.g., 3, 4, 6).
   - **Number to Advance:** Set how many cars should *not* lose a life per heat. (If you have 4 lanes, a common setting is 2).
2. Go to the **Check-in** tab.
   - Enter the names and car numbers of all your racers.
   - As cars arrive and pass physical inspection on race day, check the box in the **Passed Inspection** column. 
   - *Only cars with a checked box will be included in the race!*

---

## Running the Race

Once all cars are checked in and ready to go:

1. Click **🏁 Pinewood Admin > ▶ Run / Next Round**.
2. You will be prompted to start a new tournament. Click **Yes**.
3. A new tab called **Current Round** will be created. This shows the randomized heats for Round 1.
4. **Race!** Run the cars down your physical track according to the schedule on the sheet.
5. **Enter Results:** After each heat, enter the finish positions (1, 2, 3, 4) in the light grey `Pos` boxes next to each car's name. 
   - *Do not leave these blank. Every car racing must have a position entered.*
   - *If a car has a "BYE", do not touch their position box.*
6. Once every heat in the round has a result, click **🏁 Pinewood Admin > ▶ Run / Next Round**.
7. The system will process the results, move eliminated cars out, shuffle the remaining cars, and generate the next round.
8. Repeat steps 4-7 until the **CHAMPIONSHIP ROUND** is generated.

## The Podium
When the final round is run and the last positions are entered, clicking "Run / Next Round" will analyze the entire tournament history and pop up an interactive, celebratory Podium showing the 1st, 2nd, 3rd, and 4th place winners!

## Resetting
If you make a terrible mistake or are just running a test simulation, you can click **🏁 Pinewood Admin > ❌ Reset Whole Tournament** to wipe the slate clean and start over. (This will not delete your check-in list or settings).
