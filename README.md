# Paycheck Planner

A small static web app that helps you figure out what percentage of each paycheck
to set aside for every bill, so everything gets paid on time.

## Features

- Enter your paycheck amount and pay frequency (weekly, biweekly, twice a month, monthly)
- Add bills with their amount and due frequency (weekly through yearly)
- Automatically computes the % (and $) of each paycheck to allocate to every bill
- Warns you if your bills need more than 100% of your income
- "Record paycheck received" sets aside money into each bill's savings bucket and
  tracks leftover spending cash
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
