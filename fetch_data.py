import yfinance as yf
import pandas as pd
import json
import numpy as np
import requests
import io
from datetime import datetime

# Configuration
START_DATE = '2000-01-01'
END_DATE = datetime.now().strftime('%Y-%m-%d')

ETFS = ['GLD', 'VOO', 'SCHD', 'SPY', 'QQQ', 'QLD', 'TQQQ', 'SOXL']
INDICES = ['GC=F', '^GSPC', '^DJI', '^NDX', '^SOX']

MAPPING = {
    'GLD': {'index': 'GC=F', 'leverage': 1},
    'VOO': {'index': '^GSPC', 'leverage': 1},
    'SPY': {'index': '^GSPC', 'leverage': 1},
    'SCHD': {'index': '^DJI', 'leverage': 1},
    'QQQ': {'index': '^NDX', 'leverage': 1},
    'QLD': {'index': '^NDX', 'leverage': 2},
    'TQQQ': {'index': '^NDX', 'leverage': 3},
    'SOXL': {'index': '^SOX', 'leverage': 3},
}

def fetch_fred_krw():
    """Fetch KRW/USD exchange rate from FRED (DEXKOUS)"""
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS"
    print(f"Fetching exchange rate from FRED: {url}")
    try:
        response = requests.get(url)
        if response.status_code == 200:
            df = pd.read_csv(io.StringIO(response.text))
            df.columns = ['Date', 'KRW=X']
            df['Date'] = pd.to_datetime(df['Date'])
            df.set_index('Date', inplace=True)
            # FRED uses '.' for missing values (holidays)
            df['KRW=X'] = pd.to_numeric(df['KRW=X'], errors='coerce')
            return df
        else:
            print(f"Failed to fetch FRED data: Status {response.status_code}")
    except Exception as e:
        print(f"Error fetching FRED data: {e}")
    return None

def fetch_data():
    # 1. Fetch ETF and Index data from Yahoo Finance
    tickers = ETFS + INDICES
    print("Fetching ETF/Index data from Yahoo Finance...")
    market_data = yf.download(tickers, start=START_DATE, end=END_DATE)
    if 'Adj Close' in market_data.columns.levels[0]:
        market_data = market_data['Adj Close']
    else:
        market_data = market_data['Close']
    
    # 2. Fetch KRW/USD from FRED
    fred_data = fetch_fred_krw()
    if fred_data is not None:
        # Merge FRED data into market_data
        market_data = market_data.join(fred_data, how='outer')
    
    # Fill missing KRW=X (weekends/holidays)
    if 'KRW=X' in market_data.columns:
        market_data['KRW=X'] = market_data['KRW=X'].interpolate(method='time').ffill().bfill()
        
    # We will iterate backwards from the first valid index of each ETF to backcast
    for etf in ETFS:
        idx_symbol = MAPPING[etf]['index']
        leverage = MAPPING[etf]['leverage']
        
        # Find the first valid date for the ETF
        valid_dates = market_data[etf].dropna().index
        if len(valid_dates) == 0:
            continue
            
        first_valid_date = valid_dates[0]
        
        # Get all dates before the first valid date
        dates_to_backcast = market_data.index[market_data.index < first_valid_date]
        
        # Iterate backwards
        for i in range(len(dates_to_backcast)-1, -1, -1):
            curr_date = dates_to_backcast[i]
            next_date = market_data.index[market_data.index.get_loc(curr_date) + 1]
            
            # Index return
            idx_curr = market_data.loc[curr_date, idx_symbol]
            idx_next = market_data.loc[next_date, idx_symbol]
            
            if pd.isna(idx_curr) or pd.isna(idx_next) or idx_curr == 0:
                # If index is missing, just copy the next day's price
                market_data.loc[curr_date, etf] = market_data.loc[next_date, etf]
            else:
                idx_return = (idx_next / idx_curr) - 1
                etf_return = leverage * idx_return
                
                # Reverse calculate
                if (1 + etf_return) <= 0:
                    market_data.loc[curr_date, etf] = market_data.loc[next_date, etf]
                else:
                    market_data.loc[curr_date, etf] = market_data.loc[next_date, etf] / (1 + etf_return)
                    
    # Clean up and format
    result = {}
    
    # Filter for target date range after merging/interpolation
    market_data = market_data[market_data.index >= START_DATE]
    
    # Convert index to string
    market_data.index = market_data.index.strftime('%Y-%m-%d')
    
    # Only keep ETFS and KRW=X
    keep_cols = ETFS + ['KRW=X']
    
    for date, row in market_data.iterrows():
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
        
    print(f"Data successfully saved to data.js ({len(result)} entries)")

if __name__ == '__main__':
    fetch_data()
