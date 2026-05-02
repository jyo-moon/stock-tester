import yfinance as yf
import pandas as pd

ticker = 'KRW=X'
data = yf.download(ticker, start='1990-01-01')
print(f"Earliest date for {ticker}: {data.index[0] if not data.empty else 'No data'}")
print(data.head())
