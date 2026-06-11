export function classifyStudentOffer(tool) {
  if (!tool) return null;

  const isFriendly = tool.student_friendly === true || tool.studentFriendly === true || tool.student_perk === true || tool.studentPerk === true;
  const uniHack = tool.uniHack || '';

  if (!isFriendly) {
    if (uniHack && uniHack.trim()) {
      return 'Student Hacks';
    }
    return null;
  }

  const name = (tool.name || '').toLowerCase();
  const desc = (tool.description || tool.shortDescription || '').toLowerCase();
  const tagline = (tool.tagline || '').toLowerCase();
  const pricing = (tool.pricing || '').toLowerCase();
  const pDetail = (tool.pricingDetail || tool.pricing_detail || '').toLowerCase();

  const allText = `${name} ${tagline} ${pDetail} ${desc}`;

  // Classification keywords
  const perkKeywords = [
    'pack', 'developer pack', 'education pack', 'free for students', 
    'free student tier', 'free via .edu', 'free pro', 'completely free', 
    '100% free', 'free license', 'github education'
  ];
  
  const discountKeywords = [
    'off', 'discount', '%', 'save', 'student rate', 
    'student discount', 'special student rate', 'cut'
  ];

  const isPerk = perkKeywords.some(kw => allText.includes(kw));
  const isDiscount = discountKeywords.some(kw => allText.includes(kw));

  if (isPerk) {
    return 'Student Perks';
  }
  if (isDiscount) {
    return 'Student Discount';
  }

  // Fallback default logic if not explicitly matched
  if (pricing.includes('free')) {
    return 'Student Perks';
  }

  return 'Student Discount';
}
