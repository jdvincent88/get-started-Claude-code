# Paycheck Planner

A small static web app that helps you figure out what percentage of each paycheck
to set aside for every bill, so everything gets paid on time.

## Features

- **Multiple income sources** — add one per paycheck (e.g. you and a spouse, a side
  gig), each with its own amount and frequency. Record any paycheck as it actually
  arrives, however often that is.
- Add bills with their amount and due frequency (weekly through yearly)
- Automatically computes the % (and $/week) of every paycheck to allocate to each bill
- **Past-due catch-up planning**: flag a bill as past due with an amount owed and a
  target payoff time. The app carves a catch-up rate out of your weekly surplus
  (after regular bills), shows an estimated payoff date, and scales catch-up
  down — without shorting regular bills — if your surplus can't fully fund every
  target on schedule.
- A dashboard of stat tiles (weekly income, weekly committed, weekly surplus,
  total past-due) and a plain-language insight banner that explains your
  situation and whether catching up puts any future bill at risk of going late
- "Record a paycheck" distributes the amount across every bill's regular savings
  and past-due catch-up, and tracks leftover spending cash
- Bills are auto-marked paid (and rolled to their next due date) once enough has
  been saved and the due date arrives — or flagged if there's a shortfall
- Everything is saved in your browser's local storage, no account or server needed

## Running it

No build step or dependencies required. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g.:

  ```bash
  python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.
