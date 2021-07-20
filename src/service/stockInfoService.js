const axios = require('axios');
const cheerio = require('cheerio');
const AWS = require('aws-sdk');

const {region, timeoutLimit, month} = require('../data/constants.js');
const {stockInfoQuery, getScoreQuery} = require('../data/queries.js');
const {X_NAVER_CLIENT_ID, X_NAVER_CLIENT_SECRET} = require('../data/apiKeys.js');
const {numToKR, round1Deci} = require('../tools/formatter.js');
const {
    daumParams, newsUrl, pastDataUrl, investorUrl,
    naverApiUrl, naverApiUrl2, naverWiseUrl, isuUrl
} = require('../tools/urlGenerator.js');

AWS.config.update(region);
const docClient = new AWS.DynamoDB.DocumentClient();
axios.defaults.timeout = timeoutLimit;

/**
 * Returns stock data of past year
 * @param stockId 6 digit number code of stock
 */
async function getPastData(stockId) {
    let body, tmp;
    let prices = [];

    try {
        body = await axios.get(pastDataUrl(stockId, 250, 'day'));
    } catch (error) {
        console.log('[stockInfoService]: Error in getPastPrice')
    }
    const $ = cheerio.load(body.data, {xmlMode: true});

    $('item').each(function () {
        tmp = $(this).attr('data').split('|');
        prices.push({
            date: tmp[0].substr(0, 4) + '-' +
                tmp[0].substr(4, 2) + '-' + tmp[0].substr(6),
            start: parseInt(tmp[1]),
            high: parseInt(tmp[2]),
            low: parseInt(tmp[3]),
            end: parseInt(tmp[4]),
            volume: parseInt(tmp[5])
        });
    });
    return prices;
}

/**
 * Returns reports of company within 1 year and specific date range
 * @param stockId 6 digit number code of stock
 * @param date starting date of search
 */
async function getReports(stockId, date) {
    let allReport, dateReport = [];

    allReport = (await docClient.query(stockInfoQuery(stockId)).promise()).Items;
    allReport.forEach(report => {
        if (report.date >= date) {
            dateReport.push(report);
        }
    });

    return [allReport, dateReport];
}

/**
 * Returns basic information of the stock
 * @param stockId 6 digit number code of stock
 */
async function getBasicInfo(stockId) {
    let body;
    const params = daumParams(stockId);

    try {
        body = await axios.get(params[0], {
            headers: params[1],
        });
        const stockData = body.data;
        return {
            name: stockData.name,
            code: stockData.code,
            companySummary: stockData.companySummary.replace(/^\s+|\s+$/g, ''),
            wicsSectorName: stockData.wicsSectorName,
            openingPrice: stockData.openingPrice,
            highPrice: stockData.highPrice,
            lowPrice: stockData.lowPrice,
            tradePrice: stockData.tradePrice,
            changePrice: stockData.change === 'FALL' ?
                -stockData.changePrice : stockData.changePrice,
            changeRate: stockData.change === 'FALL' ?
                -round1Deci(stockData.changeRate * 100) : round1Deci(stockData.changeRate * 100),
            marketCap: numToKR(stockData.marketCap).replace('+', ''),
            high52wPrice: parseInt(stockData.high52wPrice),
            low52wPrice: parseInt(stockData.low52wPrice),
            foreignRatio: stockData.foreignRatio,
            per: stockData.per,
            pbr: stockData.pbr,
            roe: round1Deci((stockData.eps / stockData.bps) * 100.0)
        };
    } catch (e) {
        let data1, data2, data3;
        let promises;

        try {
            promises = [
                axios.get(naverWiseUrl(stockId)),
                axios.get(naverApiUrl(stockId)),
                axios.get(naverApiUrl2(stockId)),
                axios.get(isuUrl(stockId))
            ];

            try {
                promises = await Promise.all(promises);
            } catch (e) {}

            const $ = cheerio.load(promises[0].data);
            data1 = promises[1].data.result.areas[0].datas[0];
            data2 = promises[2].data;
            data3 = promises[3];

            let summary = '';
            const tmp = $('#cTB11 tr:nth-child(2) .num')
                .text().replace(/[,원]/g, '').split('/');

            $('ul .dot_cmp').each(function () {
                summary += $(this).text() + '\n';
            });

            return {
                name: $('.name').text(),
                code: data3.data.block1[0].full_code,
                companySummary: summary,
                wicsSectorName: $('.td0101 dt:nth-child(4)').text().substr(7),
                openingPrice: data1.ov,
                highPrice: data1.hv,
                lowPrice: data1.lv,
                tradePrice: data1.nv,
                changePrice: data1.sv - data1.nv >= 0 ? -data1.cv : data1.cv,
                changeRate: data1.sv - data1.nv >= 0 ? -data1.cr : data1.cr,
                marketCap: numToKR(data2.marketSum * 1000000).replace('+', ''),
                high52wPrice: parseInt(tmp[0]),
                low52wPrice: parseInt(tmp[1]),
                foreignRatio: parseFloat($('#cTB11 tr:nth-child(8) .num')
                    .text().trim().replace('%', '')),
                per: data2.per,
                pbr: data2.pbr,
                roe: round1Deci((data1.eps / data1.bps) * 100)
            };
        } catch (e) {
        }
    }
}

/**
 * Return news related to stock
 * @param stockName name of the stock
 */
async function getNews(stockName) {
    let body, a;
    let newsList = [];

    try {
        body = (await axios.get(newsUrl(stockName), {
            headers: {
                'X-Naver-Client-Id': X_NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': X_NAVER_CLIENT_SECRET
            }
        })).data.items;
        body.forEach(item => {
            a = item.pubDate.split(' ');
            newsList.push({
                title: item.title.replace(/(&quot;|<([^>]+)>)/ig, ''),
                description: item.description.replace(/(&quot;|<([^>]+)>)/ig, ''),
                date: a[3] + '-' + month[a[2]] + '-' + a[1],
                link: item.link
            })
        })
    } catch (e) {
        console.log('[stockInfoService]: Error from getNews');
    }

    return newsList;
}

/**
 * Returns investor statistics of past 20 trading days (개인, 외국인, 기관)
 * @param stockISU isu code of stock
 */
async function getInvestor(stockISU) {
    let body, investInfo = [];

    try {
        body = await axios.get(investorUrl(stockISU));
        body.data.output.forEach(info => {
            investInfo.push({
                date: info.TRD_DD.replace(/\//g, '-'),
                inKR: {
                    individual: numToKR(info.TRDVAL3),
                    foreign: numToKR(info.TRDVAL4),
                    institutions: numToKR(info.TRDVAL1)
                },
                inVal: {
                    individual: parseInt(info.TRDVAL3.replace(/,/g, '')),
                    foreign: parseInt(info.TRDVAL4.replace(/,/g, '')),
                    institutions: parseInt(info.TRDVAL1.replace(/,/g, ''))
                }
            })
        })
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            return [{
                date: '점검중',
                individual: 0,
                foreign: 0,
                institutions: 0
            }]
        }
        console.log('[stockInfoService]: Could not connect to KRX');
    }
    return investInfo;
}

/**
 * Returns average priceGoal
 * @param reportList list of reports
 */
async function getAverage(reportList) {
    let sum = 0, count = 0, tmp;
    if (reportList !== null) {
        reportList.forEach(item => {
            tmp = parseInt(item.priceGoal);
            if (tmp !== 0) {
                sum += tmp;
                count++;
            }
        })
        return [sum / count, count];
    }
    return 0;
}

/**
 * Returns stock element
 * @param stockId 6 digit number code of stock
 * @param date Lookup start date (YYYY-MM-DD)
 */
async function getStockOverview(stockId, date) {
    let stockObj = {};
    let promises;
    const reg = /[{}\/?.,;:|)*–~`‘’“”…!^\-_+<>@#$%&\\=('"]/gi;

    promises = [getBasicInfo(stockId), getReports(stockId, date)];
    try {
        promises = await Promise.all(promises);
    } catch (e) {
    }

    const basicInfo = promises[0];
    if (!basicInfo) return '존재하지 않는 종목입니다';
    stockObj.reportList = promises[1][0];
    const avgPrice = await getAverage(promises[1][1]);

    for (let [key, value] of Object.entries(basicInfo)) {
        stockObj[key] = value;
    }

    if (isNaN(avgPrice[0])) {
        stockObj.priceAvg = '의견 없음';
        stockObj.expYield = 0;
    } else {
        stockObj.priceAvg = Math.round(avgPrice[0]);
        stockObj.expYield = round1Deci((stockObj.priceAvg /
            stockObj.tradePrice - 1) * 100);
    }

    try {
        stockObj.score = (await docClient.query(
            getScoreQuery(stockId)).promise()).Items[0].score;
    } catch (e) {
        stockObj.score = '-';
    }

    promises = [getPastData(stockId), getInvestor(basicInfo.code), getNews(basicInfo.name)];

    try {
        promises = await Promise.all(promises);
    } catch (e) {
    }

    stockObj.pastData = promises[0];
    stockObj.invStatistics = promises[1];
    stockObj.news = promises[2];
    stockObj.newsTitles = '';
    stockObj.news.forEach(item => {
        stockObj.newsTitles += item.title.replace(stockObj.name, '')
            .replace(/ *\[[^)]*] */g, "").replace(reg, ' ') + ' ';
    })
    stockObj.newsTitles = stockObj.newsTitles.replace(/  +/g, ' ');

    return stockObj;
}

module.exports = {getStockOverview};
