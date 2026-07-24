export const jobTitles = [
  { value: '前端开发工程师', label: '前端开发工程师' },
  { value: '后端开发工程师', label: '后端开发工程师' },
  { value: '全栈工程师', label: '全栈工程师' },
  { value: '产品经理', label: '产品经理' },
  { value: 'UI/UX设计师', label: 'UI/UX设计师' },
  { value: '测试工程师', label: '测试工程师' },
  { value: '数据分析师', label: '数据分析师' },
  { value: '项目经理', label: '项目经理' },
  { value: '市场运营', label: '市场运营' },
  { value: 'HRBP', label: 'HRBP' },
];

export const departments = [
  { value: 'tech', label: '技术部' },
  { value: 'product', label: '产品部' },
  { value: 'design', label: '设计部' },
  { value: 'marketing', label: '市场部' },
  { value: 'data', label: '数据部' },
  { value: 'hr', label: '人力资源部' },
  { value: 'finance', label: '财务部' },
  { value: 'operations', label: '运营部' },
];

export const interviewTypes = [
  { value: 'phone', label: '电话面试' },
  { value: 'tech', label: '技术面试' },
  { value: 'hr', label: 'HR面试' },
  { value: 'final', label: '终面' },
];

export const candidateStages = [
  { value: 'new', label: '待筛选', color: 'bg-secondary-100 text-secondary-700' },
  { value: 'screening', label: '初筛通过', color: 'bg-primary-100 text-primary-700' },
  { value: 'interviewing', label: '面试中', color: 'bg-accent-100 text-accent-700' },
  { value: 'offer', label: '已发Offer', color: 'bg-primary-100 text-primary-700' },
  { value: 'hired', label: '已入职', color: 'bg-accent-100 text-accent-700' },
  { value: 'rejected', label: '已淘汰', color: 'bg-secondary-100 text-secondary-700' },
];

export const urgencyLevels = [
  { value: 'urgent', label: '紧急', color: 'bg-accent-100 text-accent-700' },
  { value: 'high', label: '高', color: 'bg-primary-100 text-primary-700' },
  { value: 'normal', label: '普通', color: 'bg-secondary-100 text-secondary-700' },
];

export interface ProvinceCity {
  name: string;
  cities: string[];
}

export const provinceCityData: ProvinceCity[] = [
  { name: '北京市', cities: ['朝阳区', '海淀区', '丰台区', '东城区', '西城区', '通州区', '大兴区', '昌平区'] },
  { name: '上海市', cities: ['浦东新区', '徐汇区', '静安区', '黄浦区', '长宁区', '闵行区', '杨浦区', '虹口区'] },
  { name: '天津市', cities: ['和平区', '河西区', '南开区', '滨海新区', '河东区', '河北区', '西青区'] },
  { name: '重庆市', cities: ['渝北区', '江北区', '渝中区', '南岸区', '九龙坡区', '沙坪坝区', '万州区'] },
  { name: '河北省', cities: ['石家庄', '唐山', '保定', '邯郸', '廊坊', '秦皇岛', '沧州'] },
  { name: '山西省', cities: ['太原', '大同', '长治', '临汾', '晋中', '运城'] },
  { name: '内蒙古自治区', cities: ['呼和浩特', '包头', '鄂尔多斯', '赤峰', '通辽'] },
  { name: '辽宁省', cities: ['沈阳', '大连', '鞍山', '锦州', '营口', '盘锦'] },
  { name: '吉林省', cities: ['长春', '吉林', '延边', '四平', '通化'] },
  { name: '黑龙江省', cities: ['哈尔滨', '大庆', '齐齐哈尔', '牡丹江', '佳木斯'] },
  { name: '江苏省', cities: ['南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州', '镇江'] },
  { name: '浙江省', cities: ['杭州', '宁波', '温州', '嘉兴', '绍兴', '金华', '台州', '湖州'] },
  { name: '安徽省', cities: ['合肥', '芜湖', '马鞍山', '安庆', '蚌埠', '阜阳'] },
  { name: '福建省', cities: ['福州', '厦门', '泉州', '漳州', '莆田', '龙岩'] },
  { name: '江西省', cities: ['南昌', '九江', '赣州', '景德镇', '上饶', '宜春'] },
  { name: '山东省', cities: ['济南', '青岛', '烟台', '潍坊', '临沂', '淄博', '威海', '济宁'] },
  { name: '河南省', cities: ['郑州', '洛阳', '开封', '南阳', '许昌', '新乡', '周口'] },
  { name: '湖北省', cities: ['武汉', '宜昌', '襄阳', '荆州', '黄石', '十堰', '鄂州'] },
  { name: '湖南省', cities: ['长沙', '株洲', '湘潭', '岳阳', '衡阳', '常德', '郴州'] },
  { name: '广东省', cities: ['广州', '深圳', '东莞', '佛山', '珠海', '惠州', '中山', '汕头'] },
  { name: '广西壮族自治区', cities: ['南宁', '柳州', '桂林', '北海', '玉林', '梧州'] },
  { name: '海南省', cities: ['海口', '三亚', '儋州', '琼海', '文昌'] },
  { name: '四川省', cities: ['成都', '绵阳', '德阳', '宜宾', '泸州', '南充', '乐山'] },
  { name: '贵州省', cities: ['贵阳', '遵义', '毕节', '六盘水', '安顺'] },
  { name: '云南省', cities: ['昆明', '大理', '丽江', '曲靖', '玉溪', '普洱'] },
  { name: '西藏自治区', cities: ['拉萨', '日喀则', '林芝', '昌都'] },
  { name: '陕西省', cities: ['西安', '咸阳', '宝鸡', '榆林', '渭南', '汉中'] },
  { name: '甘肃省', cities: ['兰州', '天水', '酒泉', '庆阳', '张掖'] },
  { name: '青海省', cities: ['西宁', '海东', '格尔木'] },
  { name: '宁夏回族自治区', cities: ['银川', '石嘴山', '吴忠', '中卫'] },
  { name: '新疆维吾尔自治区', cities: ['乌鲁木齐', '克拉玛依', '库尔勒', '昌吉', '伊犁'] },
  { name: '香港特别行政区', cities: ['中西区', '湾仔区', '东区', '九龙城', '油尖旺'] },
  { name: '澳门特别行政区', cities: ['澳门半岛', '氹仔', '路环'] },
  { name: '台湾省', cities: ['台北', '新北', '台中', '高雄', '台南', '桃园', '新竹'] },
];