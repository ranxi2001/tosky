const NICKNAMES = [
  "币圈新手", "合约小白", "DeFi玩家", "链上冲浪", "稳定收益",
  "定投达人", "量化学徒", "现货党", "搬砖日记", "空投猎人",
  "挖矿老哥", "韭菜自救", "长线持有", "波段选手", "梭哈勇士",
  "低吸高抛", "价值投资", "趋势追踪", "链上数据", "新人求教",
  "老韭菜", "屯币党", "合约战士", "牛市等待", "熊市抄底",
  "佛系持仓", "节点运营", "Web3学徒", "NFT收藏", "DAO治理",
  "跨链玩家", "稳健理财", "短线游击", "技术分析", "基本面派",
  "止损大师", "仓位管理", "Alpha猎手", "Meme冲锋", "流动性挖矿",
  "套利机器", "永续合约", "期权新手", "钱包安全", "冷钱包党",
  "Gas优化", "MEV研究", "预言机", "借贷挖矿", "收益农场",
];

const CITIES = [
  "北京·朝阳", "北京·海淀", "上海·浦东", "上海·徐汇", "深圳·南山",
  "深圳·福田", "广州·天河", "广州·越秀", "杭州·西湖", "杭州·滨江",
  "成都·高新", "成都·锦江", "重庆·渝中", "重庆·江北", "武汉·光谷",
  "武汉·武昌", "南京·鼓楼", "南京·建邺", "苏州·工业园", "苏州·姑苏",
  "长沙·岳麓", "长沙·芙蓉", "西安·雁塔", "西安·碑林", "郑州·金水",
  "合肥·蜀山", "济南·历下", "青岛·崂山", "厦门·思明", "福州·鼓楼",
  "昆明·五华", "贵阳·观山湖", "天津·南开", "大连·中山", "沈阳·和平",
  "哈尔滨·南岗", "长春·朝阳", "无锡·滨湖", "宁波·鄞州", "东莞·南城",
  "香港·中环", "香港·旺角", "台北·信义", "台北·大安", "新加坡",
  "吉隆坡", "曼谷", "东京·涩谷", "首尔·江南", "迪拜·商业湾",
  "多伦多", "温哥华", "悉尼", "墨尔本", "伦敦·金丝雀码头",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface QaPersona {
  nickname: string;
  city: string;
  avatarUrl: string;
}

export function getQaPersona(question: string, index: number): QaPersona {
  const h = hash(question + index);
  const nickname = NICKNAMES[h % NICKNAMES.length];
  const city = CITIES[(h >>> 4) % CITIES.length];
  const seed = encodeURIComponent(question.slice(0, 20) + index);
  const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&size=64`;

  return { nickname, city, avatarUrl };
}
