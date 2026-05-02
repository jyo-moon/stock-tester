import yfinance as yf
import pandas as pd
import json
import numpy as np
from datetime import datetime

# Configuration
START_DATE = '2000-01-01'
END_DATE = datetime.now().strftime('%Y-%m-%d')

ETFS = ['VOO', 'SCHD', 'SPY', 'QQQ', 'QLD', 'TQQQ', 'SOXL']
INDICES = ['^GSPC', '^DJI', '^NDX', '^SOX']
CURRENCY = 'KRW=X'

MAPPING = {
    'VOO': {'index': '^GSPC', 'leverage': 1},
    'SPY': {'index': '^GSPC', 'leverage': 1},
    'SCHD': {'index': '^DJI', 'leverage': 1}, # Using Dow Jones as proxy
    'QQQ': {'index': '^NDX', 'leverage': 1},
    'QLD': {'index': '^NDX', 'leverage': 2},
    'TQQQ': {'index': '^NDX', 'leverage': 3},
    'SOXL': {'index': '^SOX', 'leverage': 3},
}

def fetch_data():
    tickers = ETFS + INDICES + [CURRENCY]
    print("Fetching data from Yahoo Finance...")
    data = yf.download(tickers, start=START_DATE, end=END_DATE)
    if 'Adj Close' in data.columns.levels[0]:
        data = data['Adj Close']
    else:
        data = data['Close']
    
    # Fill missing KRW=X with forward fill then backward fill
    if 'KRW=X' in data.columns:
        data['KRW=X'] = data['KRW=X'].ffill().bfill()
        
    # We will iterate backwards from the first valid index of each ETF to backcast
    for etf in ETFS:
        idx_symbol = MAPPING[etf]['index']
        leverage = MAPPING[etf]['leverage']
        
        # Find the first valid date for the ETF
        valid_dates = data[etf].dropna().index
        if len(valid_dates) == 0:
            continue
            
        first_valid_date = valid_dates[0]
        
        # Get all dates before the first valid date
        dates_to_backcast = data.index[data.index < first_valid_date]
        
        # Iterate backwards
        for i in range(len(dates_to_backcast)-1, -1, -1):
            curr_date = dates_to_backcast[i]
            next_date = data.index[data.index.get_loc(curr_date) + 1]
            
            # Index return
            idx_curr = data.loc[curr_date, idx_symbol]
            idx_next = data.loc[next_date, idx_symbol]
            
            if pd.isna(idx_curr) or pd.isna(idx_next) or idx_curr == 0:
                # If index is missing, just copy the next day's price
                data.loc[curr_date, etf] = data.loc[next_date, etf]
            else:
                idx_return = (idx_next / idx_curr) - 1
                etf_return = leverage * idx_return
                
                # Reverse calculate
                # next_price = curr_price * (1 + etf_return)
                # curr_price = next_price / (1 + etf_return)
                if (1 + etf_return) <= 0:
                    data.loc[curr_date, etf] = data.loc[next_date, etf]
                else:
                    data.loc[curr_date, etf] = data.loc[next_date, etf] / (1 + etf_return)
                    
    # Clean up and format
    result = {}
    
    # Convert index to string
    data.index = data.index.strftime('%Y-%m-%d')
    
    # Only keep ETFS and KRW=X
    keep_cols = ETFS + ['KRW=X']
    
    for date, row in data.iterrows():
        # Check if row is entirely NaN for keep cols
        if row[keep_cols].isna().all():
            continue
            
        result[date] = {
            'KRW_X': round(row['KRW=X'], 2) if not pd.isna(row['KRW=X']) else 1300.0
        }
        for etf in ETFS:
            result[date][etf] = round(row[etf], 4) if not pd.isna(row[etf]) else None

    # Write to a js file
    with open('data.js', 'w') as f:
        f.write("const marketData = ")
        json.dump(result, f, separators=(',', ':'))
        f.write(";\n")
        
    print("Data successfully saved to data.js")

if __name__ == '__main__':
    fetch_data()
