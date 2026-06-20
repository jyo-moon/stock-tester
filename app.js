const ETFS = ['CASH', 'GLD', 'VOO', 'SCHD', 'SPY', 'QQQ', 'QLD', 'TQQQ', 'SOXL', '472160.KS'];

// Approximate Annual Dividend Yields
const DIVIDEND_YIELD = {
    'CASH': 0.0,
    'GLD': 0.0,
    'VOO': 0.015,
    'SCHD': 0.035,
    'SPY': 0.015,
    'QQQ': 0.006,
    'QLD': 0.0,
    'TQQQ': 0.0,
    'SOXL': 0.0,
    '472160.KS': 0.002
};

let portfolioWeights = {};
ETFS.forEach(etf => portfolioWeights[etf] = 0);
let chartInstance = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initPortfolioInputs();
    
    // Default values
    document.getElementById('weight-VOO').value = 20;
    document.getElementById('range-VOO').value = 20;
    document.getElementById('weight-SPY').value = 30;
    document.getElementById('range-SPY').value = 30;
    document.getElementById('weight-QQQ').value = 50;
    document.getElementById('range-QQQ').value = 50;
    updatePortfolioWeights();

    // Set dynamic date ranges based on available marketData
    if (typeof marketData !== 'undefined') {
        const allDates = Object.keys(marketData).sort();
        if (allDates.length > 0) {
            const minDate = allDates[0];
            const maxDate = allDates[allDates.length - 1];
            
            const startDateInput = document.getElementById('startDate');
            const endDateInput = document.getElementById('endDate');
            
            startDateInput.min = minDate;
            startDateInput.max = maxDate;
            startDateInput.value = allDates.includes('2000-01-01') ? '2000-01-01' : minDate;
            
            endDateInput.min = minDate;
            endDateInput.max = maxDate;
            endDateInput.value = maxDate;
            
            const subHeader = document.querySelector('.header p');
            if (subHeader) {
                const startYearMonth = minDate.substring(0, 7).replace('-', '.');
                const endYearMonth = maxDate.substring(0, 7).replace('-', '.');
                subHeader.innerText = `${startYearMonth} - ${endYearMonth} 미국 주식 시뮬레이터`;
            }
        }
    }

    // Currency inputs setup
    setupCurrencyInput('initialAmount', 'initialAmountHint');
    setupCurrencyInput('dcaAmount', 'dcaAmountHint');

    // DCA settings toggle logic
    const dcaFreq = document.getElementById('dcaFrequency');
    const dcaSettings = document.getElementById('dcaSettings');
    const dcaWeekly = document.getElementById('dcaWeeklySetting');
    const dcaMonthly = document.getElementById('dcaMonthlySetting');

    dcaFreq.addEventListener('change', (e) => {
        const val = e.target.value;
        if(val === 'none') {
            dcaSettings.style.display = 'none';
        } else {
            dcaSettings.style.display = 'block';
            if(val === 'weekly') {
                dcaWeekly.style.display = 'block';
                dcaMonthly.style.display = 'none';
            } else if(val === 'monthly') {
                dcaWeekly.style.display = 'none';
                dcaMonthly.style.display = 'block';
            } else {
                dcaWeekly.style.display = 'none';
                dcaMonthly.style.display = 'none';
            }
        }
    });

    // Trigger initial change
    dcaFreq.dispatchEvent(new Event('change'));

    document.getElementById('runBtn').addEventListener('click', runSimulation);
});

function showError(msg) {
    const errorBox = document.getElementById('errorBox');
    if(msg) {
        errorBox.innerText = msg + ' (클릭하여 닫기)';
        errorBox.style.display = 'block';
        
        // Hide on click
        errorBox.onclick = () => {
            errorBox.style.display = 'none';
        };
    } else {
        errorBox.style.display = 'none';
    }
}

function initPortfolioInputs() {
    const container = document.getElementById('portfolioInputs');
    
    ETFS.forEach(etf => {
        const div = document.createElement('div');
        div.className = 'portfolio-item';
        const displayName = etf === 'CASH' ? '현금 ($)' : 
                            etf === '472160.KS' ? 'TIGER 미국테크TOP10 INDXX(H)' : etf;
        div.innerHTML = `
            <span>${displayName}</span>
            <div class="range-container">
                <input type="range" id="range-${etf}" min="0" max="100" value="0">
                <input type="number" id="weight-${etf}" class="weight-input" min="0" max="100" value="0">
            </div>
        `;
        container.appendChild(div);

        const range = document.getElementById(`range-${etf}`);
        const input = document.getElementById(`weight-${etf}`);

        range.addEventListener('input', (e) => {
            input.value = e.target.value;
            updatePortfolioWeights();
        });

        input.addEventListener('input', (e) => {
            range.value = e.target.value;
            updatePortfolioWeights();
        });
    });
}

function updatePortfolioWeights() {
    let total = 0;
    ETFS.forEach(etf => {
        let val = parseFloat(document.getElementById(`weight-${etf}`).value) || 0;
        portfolioWeights[etf] = val;
        total += val;
    });
    
    const totalEl = document.getElementById('totalWeight');
    totalEl.innerText = total;
    if(total !== 100) {
        totalEl.style.color = 'var(--danger)';
    } else {
        totalEl.style.color = 'var(--accent)';
    }
}

function runSimulation() {
    showError(null);
    updatePortfolioWeights(); // Ensure weights are latest

    let totalW = 0;
    ETFS.forEach(etf => {
        totalW += portfolioWeights[etf];
    });

    if(Math.round(totalW) !== 100) {
        showError('포트폴리오 비중의 합을 100%로 맞춰주세요. (현재 합계: ' + Math.round(totalW) + '%)');
        return;
    }

    if(typeof marketData === 'undefined') {
        showError('데이터를 불러오지 못했습니다.');
        return;
    }

    const initialAmountStr = document.getElementById('initialAmount').value.replace(/,/g, '');
    const initialAmount = parseFloat(initialAmountStr) || 0;
    const dcaFreq = document.getElementById('dcaFrequency').value;
    const dcaAmountStr = document.getElementById('dcaAmount').value.replace(/,/g, '');
    const dcaAmount = parseFloat(dcaAmountStr) || 0;
    const dcaWeekday = parseInt(document.getElementById('dcaWeekday').value);
    const dcaMonthDay = parseInt(document.getElementById('dcaMonthDay').value);
    const cashInterestRate = parseFloat(document.getElementById('cashInterestRate').value) || 0;

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const dripOn = document.getElementById('dripToggle').checked;
    const taxOn = document.getElementById('taxToggle').checked;
    const rebalance = document.getElementById('rebalancePeriod').value; // 'none', 'monthly', 'quarterly', 'yearly'

    if(new Date(startDate) >= new Date(endDate)) {
        showError('종료일이 시작일보다 이후여야 합니다.');
        return;
    }

    // 1. Filter dates
    const allDates = Object.keys(marketData).sort();
    const simDates = allDates.filter(d => d >= startDate && d <= endDate);

    if(simDates.length === 0) {
        showError('해당 기간의 데이터가 없습니다.');
        return;
    }

    // Initialize tracking
    let totalInvestedKRW = 0;
    
    let shares = {};
    let lastPrice = {}; // cache for 0 or missing data
    let uninvestedUSD = {}; // per ETF uninvested amount due to missing price
    ETFS.forEach(e => { 
        shares[e] = 0; 
        lastPrice[e] = 0; 
        uninvestedUSD[e] = 0;
    });
    
    // Initialize CASH price at 1.0 USD
    lastPrice['CASH'] = 1.0;
    
    // Result arrays for chart
    let chartLabels = [];
    let chartDataTotal = []; // KRW total
    let chartDataInvested = []; // Invested total

    // Annual summary map: year -> {invested, final}
    let annualSummary = {};

    let lastMonth = -1;
    let lastYear = -1;
    
    // tracking for DCA
    let lastBoughtWeek = -1;
    let lastBoughtMonth = -1;
    
    let maxTotalKRW = 0;
    let mdd = 0;

    for(let i = 0; i < simDates.length; i++) {
        const date = simDates[i];
        const data = marketData[date];
        const krwX = data.KRW_X;
        
        const dateObj = new Date(date);
        const month = dateObj.getMonth();
        const year = dateObj.getFullYear();
        const dayOfWeek = dateObj.getDay(); // 0(Sun) ~ 6(Sat)
        const dayOfMonth = dateObj.getDate();
        
        // calculate ISO week number roughly
        const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);

        const isFirstDayOfMonth = month !== lastMonth;
        const isFirstDayOfYear = year !== lastYear;

        // update price cache
        ETFS.forEach(etf => {
            if(etf === 'CASH') {
                // Cash interest growth based on days since last sim date
                if(i > 0) {
                    const daysDiff = (new Date(simDates[i]) - new Date(simDates[i-1])) / (1000 * 60 * 60 * 24);
                    const dailyRate = (cashInterestRate / 100) / 365;
                    lastPrice['CASH'] = lastPrice['CASH'] * (1 + (dailyRate * daysDiff));
                }
            } else if(data[etf] && data[etf] > 0) {
                lastPrice[etf] = data[etf];
            }
        });

        // --- Investment Logic ---
        let buyAmountKRW = 0;
        
        if(i === 0) {
            buyAmountKRW += initialAmount;
        } 
        
        if(dcaFreq !== 'none' && dcaAmount > 0) {
            if(dcaFreq === 'daily') {
                buyAmountKRW += dcaAmount;
            } else if(dcaFreq === 'weekly') {
                if(dayOfWeek >= dcaWeekday && lastBoughtWeek !== weekNo) {
                    buyAmountKRW += dcaAmount;
                    lastBoughtWeek = weekNo;
                }
            } else if(dcaFreq === 'monthly') {
                if(dayOfMonth >= dcaMonthDay && lastBoughtMonth !== month) {
                    buyAmountKRW += dcaAmount;
                    lastBoughtMonth = month;
                }
            }
        }

        if(buyAmountKRW > 0) {
            totalInvestedKRW += buyAmountKRW;
            const buyAmountUSD = buyAmountKRW / krwX;
            
            // distribute buy amount to each ETF's uninvested bucket
            ETFS.forEach(etf => {
                const w = portfolioWeights[etf] / 100;
                if(w > 0) {
                    uninvestedUSD[etf] += (buyAmountUSD * w);
                }
            });
        }

        // Try to buy with uninvested funds if price is now available
        ETFS.forEach(etf => {
            if(uninvestedUSD[etf] > 0 && lastPrice[etf] > 0) {
                shares[etf] += (uninvestedUSD[etf] / lastPrice[etf]);
                uninvestedUSD[etf] = 0;
            }
        });

        // --- Rebalancing Logic ---
        let doRebalance = false;
        if(rebalance === 'monthly' && isFirstDayOfMonth && i > 0) doRebalance = true;
        if(rebalance === 'quarterly' && isFirstDayOfMonth && (month % 3 === 0) && i > 0) doRebalance = true;
        if(rebalance === 'yearly' && isFirstDayOfYear && i > 0) doRebalance = true;

        if(doRebalance) {
            let totalUsdValue = 0;
            ETFS.forEach(etf => {
                if(lastPrice[etf] > 0) totalUsdValue += shares[etf] * lastPrice[etf];
            });

            if(totalUsdValue > 0) {
                ETFS.forEach(etf => {
                    if(lastPrice[etf] > 0) {
                        const targetUsd = totalUsdValue * (portfolioWeights[etf] / 100);
                        shares[etf] = targetUsd / lastPrice[etf];
                    }
                });
            }
        }

        // --- Calculate Daily Value ---
        let dailyTotalUSD = 0;
        ETFS.forEach(etf => {
            if(lastPrice[etf] > 0) {
                let price = lastPrice[etf];
                
                // DRIP simulation: The data we fetched is mostly Adj Close (DRIP applied).
                // If user turns DRIP OFF, we should penalize the price by the dividend yield over time.
                if(!dripOn && DIVIDEND_YIELD[etf] > 0) {
                    // Very rough approximation: reduce value by daily div yield
                    // Days since start
                    const days = i; 
                    const penalty = 1 - (DIVIDEND_YIELD[etf] / 252 * days);
                    price = price * penalty;
                }

                dailyTotalUSD += shares[etf] * price;
            }
            // Also include uninvested cash in total value (it's held as USD cash)
            if(uninvestedUSD[etf] > 0) {
                dailyTotalUSD += uninvestedUSD[etf];
            }
        });

        const dailyTotalKRW = dailyTotalUSD * krwX;

        // Calculate MDD
        if(dailyTotalKRW > 0) {
            if(dailyTotalKRW > maxTotalKRW) maxTotalKRW = dailyTotalKRW;
            const currentDrawdown = (maxTotalKRW - dailyTotalKRW) / maxTotalKRW;
            if(currentDrawdown > mdd) mdd = currentDrawdown;
        }

        // Save for chart (e.g. every week or so to avoid too many points, but modern devices can handle 6000 points. We'll sample if > 1000)
        chartLabels.push(date);
        chartDataTotal.push(Math.round(dailyTotalKRW));
        chartDataInvested.push(Math.round(totalInvestedKRW));

        // Save annual summary
        if(isFirstDayOfYear || i === simDates.length - 1) {
            // we store the last known value of the previous year
            if(lastYear !== -1) {
                annualSummary[lastYear] = {
                    invested: totalInvestedKRW,
                    final: dailyTotalKRW
                };
            }
        }
        // At the very end, store the final year
        if(i === simDates.length - 1) {
            annualSummary[year] = {
                invested: totalInvestedKRW,
                final: dailyTotalKRW
            };
        }

        lastMonth = month;
        lastYear = year;
    }

    const finalKRW = chartDataTotal[chartDataTotal.length - 1];
    
    // Tax and Fees
    let afterTaxFinalKRW = finalKRW;
    if(taxOn) {
        const fee = totalInvestedKRW * 0.0015; // roughly 0.15% combined fees
        const profit = finalKRW - totalInvestedKRW - fee;
        let tax = 0;
        if(profit > 2500000) {
            tax = (profit - 2500000) * 0.22;
        }
        afterTaxFinalKRW = finalKRW - fee - tax;
    }

    const returnPct = ((afterTaxFinalKRW / totalInvestedKRW) - 1) * 100;
    
    const years = simDates.length / 252;
    const cagr = ((Math.pow(afterTaxFinalKRW / totalInvestedKRW, 1/years)) - 1) * 100;

    // Update UI
    document.getElementById('resultsSection').style.display = 'block';
    
    document.getElementById('resInvested').innerText = formatKRW(totalInvestedKRW);
    document.getElementById('resFinal').innerText = formatKRW(afterTaxFinalKRW);
    document.getElementById('resReturn').innerText = returnPct.toFixed(2) + '%';
    document.getElementById('resReturn').style.color = returnPct >= 0 ? 'var(--accent)' : 'var(--danger)';
    
    document.getElementById('resCagr').innerText = cagr.toFixed(2) + '%';
    document.getElementById('resMdd').innerText = '-' + (mdd * 100).toFixed(2) + '%';

    renderChart(chartLabels, chartDataTotal, chartDataInvested);
    renderTable(annualSummary);
    
    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({behavior: 'smooth'});
}

function num2han(num) {
    num = parseInt(num.toString().replace(/,/g, '')) || 0;
    if(num === 0) return '0원';
    const units = ['', '만', '억', '조'];
    let result = '';
    let unitIdx = 0;
    while(num > 0) {
        const mod = num % 10000;
        if(mod > 0) {
            result = mod + units[unitIdx] + ' ' + result;
        }
        num = Math.floor(num / 10000);
        unitIdx++;
    }
    return result.trim() + '원';
}

function setupCurrencyInput(inputId, hintId) {
    const input = document.getElementById(inputId);
    const hint = document.getElementById(hintId);
    
    input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
        if(val) {
            e.target.value = parseInt(val).toLocaleString('ko-KR');
            hint.innerText = num2han(val);
        } else {
            e.target.value = '';
            hint.innerText = '0원';
        }
    });
    // init
    input.dispatchEvent(new Event('input'));
}

function renderTable(annualSummary) {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';
    
    const years = Object.keys(annualSummary).sort();
    years.forEach(year => {
        const data = annualSummary[year];
        const ret = data.invested > 0 ? ((data.final / data.invested) - 1) * 100 : 0;
        const color = ret >= 0 ? 'var(--accent)' : 'var(--danger)';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${year}</td>
            <td>${formatKRW(data.invested)}</td>
            <td>${formatKRW(data.final)}</td>
            <td style="color: ${color}">${ret.toFixed(2)}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function formatKRW(num) {
    return Math.round(num).toLocaleString('ko-KR') + '원';
}

function renderChart(labels, data, investedData) {
    const ctx = document.getElementById('resultChart').getContext('2d');
    
    if(chartInstance) {
        chartInstance.destroy();
    }

    // Reduce data points for performance if too many
    const maxPoints = 500;
    const step = Math.ceil(labels.length / maxPoints);
    const filteredLabels = labels.filter((_, i) => i % step === 0);
    const filteredData = data.filter((_, i) => i % step === 0);
    const filteredInvested = investedData.filter((_, i) => i % step === 0);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: filteredLabels,
            datasets: [
                {
                    label: '포트폴리오 자산 (원)',
                    data: filteredData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.1,
                    order: 1
                },
                {
                    label: '원금 (투자금 합계)',
                    data: filteredInvested,
                    borderColor: '#94A3B8',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.1,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatKRW(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#94A3B8',
                        callback: function(value) {
                            return value >= 100000000 
                                ? (value / 100000000).toFixed(1) + '억' 
                                : (value / 10000).toFixed(0) + '만';
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94A3B8',
                        maxTicksLimit: 6
                    }
                }
            }
        }
    });
}
