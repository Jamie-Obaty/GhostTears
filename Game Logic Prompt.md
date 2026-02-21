# **GHOSTTEARS Master Specification Prompt**

Build a high-stakes, turn-based multiplayer word game titled **"GHOSTTEARS"** using **React**, **Tailwind CSS**, and **Lucide-React**.

## **1\. GAME OVERVIEW**

GHOSTTEARS is a word-building game where players add letters to a shared string to form country names. The goal is to avoid being the one to complete a country, break the valid prefix chain, or run out of time.

## **2\. CORE MECHANICS & RULES**

* **Turn-based:** Exactly one letter per turn (A-Z).  
* **Penalty (GHOSTTEARS):** Players receive a letter of the word "GHOSTTEARS" for any round-ending condition.  
* **Round-Ending Conditions (Penalty assigned to Active Player):**  
  1. **Invalid Prefix:** The string is no longer a prefix of any valid country.  
  2. **Completion:** The string exactly matches a country name.  
  3. **Repeat:** The string matches a country already used in the session.  
  4. **Timeout:** The 10-second timer expires.  
* **Timer Rules:**  
  * Timer is OFF when the string is empty.  
  * Timer starts (10s) immediately after the first letter is submitted.  
  * Timer resets to 10s for every subsequent turn in that round.  
* **Elimination:** A player is eliminated when they reach 10 penalties (the full word "GHOSTTEARS").  
* **Win Conditions:**  
  * **2 Players:** The game ends immediately when the first player is eliminated.  
  * **3+ Players:** Last man standing.

## **3\. UI/UX DESIGN (Dark Aesthetic)**

* **Theme:** Deep dark navy/charcoal background (\#0a0f18) with glassmorphism elements.  
* **Top HUD:** \- **Left:** Pause/Resume button.  
  * **Right:** A distinct Timer module showing the countdown.  
* **"TYPE HERE" Display:** A massive, centered horizontal box at the top showing the current string in a bold, tracking-heavy font.  
* **Player Cards:** \- Each card contains an **Animated SVG Avatar**.  
  * Player name and active turn indicator.  
  * **Horizontal Penalty Tracker:** Positioned directly under the player info, consisting of 10 segments (G-H-O-S-T-T-E-A-R-S).  
* **Pause System:** A full-screen blur overlay that halts the timer and input.

## **4\. ANIMATED SVG AVATARS**

Characters must react dynamically to the game state:

* **Idle:** Neutral expression, blinking.  
* **Active:** Glowing pulse effect.  
* **Nervous:** Triggered when timer \<= 3 seconds (sweat drips, squinting).  
* **Shocked:** Triggered for 1.5s when receiving a penalty (wide eyes, red face, bounce animation).  
* **Eliminated:** Eyes turn to "X"s, frowning, grayscale effect.  
* **Winner:** Celebration expression (smiling, emerald green theme).

## **5\. TECHNICAL REQUIREMENTS**

* **Single File:** The entire application must be contained within one .jsx file.  
* **State Management:** Use React hooks (useState, useEffect, useCallback) for the game loop and timer.  
* **Data:** Include a comprehensive set of world countries and a pre-calculated prefix set for O(1) validation.  
* **Input:** Handle physical keyboard events for A-Z characters.