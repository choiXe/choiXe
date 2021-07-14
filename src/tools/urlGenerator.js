function generateUrl(baseUrl, params) {
    let url = baseUrl + '?';
    for (const property in params) {
        url += `${property}=${params[property]}&`
    }
    return url;
}

function daumParams(stockId) {
    const url = 'https://finance.daum.net/api/quotes/A'
        + stockId + '?summary=false&changeStatistics=true';
    const header = {
        referer: 'https://finance.daum.net/quotes/A' + stockId,
        'user-agent': 'Mozilla/5.0'
    };
    return [url, header];
}

function newsUrl(stockName) {
    return 'https://openapi.naver.com/v1/search/news.json?query=' +
        encodeURI(stockName) + '&display=100&sort=sim';
}

/**
 * @param stockId 6 digit number code of stock
 * @param count number of data
 * @param option day, week, month
 */
function pastDataUrl(stockId, count, option) {
    return 'https://fchart.stock.naver.com/sise.nhn?requestType=0&symbol=' +
        stockId + '&count=' + count + '&timeframe=' + option;
}

function investorUrl(stockISU) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 31);
    const url = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';

    let params = {
        bld: 'dbms/MDC/STAT/standard/MDCSTAT02302',
        isuCd: stockISU,
        strtDd: startDate.toISOString().slice(0, 10).replace(/-/g, ''),
        endDd: endDate.toISOString().slice(0, 10).replace(/-/g, ''),
        askBid: 3,
        trdVolVal: 2
    }

    return generateUrl(url, params);
}

function naverApiUrl(stockIds) {
    return 'https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:' + stockIds;
}

function wiseReportUrl(stockId) {
    return 'https://comp.wisereport.co.kr/company/cF1002.aspx?finGubun=MAIN&frq=0&cmp_cd=' + stockId;
}

function indicatorUrlKR() {
    return 'https://polling.finance.naver.com/api/realtime?query=SERVICE_INDEX:KOSPI,KOSDAQ,KPI200';
}

function indicatorUrlGlobal() {
    const url = 'https://finance.daum.net/api/global/quotes';
    const header = {
        referer: 'https://finance.daum.net/global',
        'user-agent': 'Mozilla/5.0'
    }
    return [url, header];
}

module.exports = {
    daumParams, newsUrl, pastDataUrl,
    investorUrl, naverApiUrl, wiseReportUrl,
    indicatorUrlKR, indicatorUrlGlobal
};
