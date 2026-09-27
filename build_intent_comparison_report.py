import json
import os
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


WORKSPACE = Path("/Users/tangyichuan/.codex/.chatgpt-projects/g-p-6aa65ef4aa80819182c7200d2300c5c7")
OUTPUT = WORKSPACE / "915_vs_912_意图对比报告.docx"
ASSET_DIR = Path("/private/tmp/langbridge_intent_report_assets")
ASSET_DIR.mkdir(parents=True, exist_ok=True)

FILES = {
    "912": Path("/Users/tangyichuan/.ks-cli/tmp/langbridge-eval-run-statistics-1789703773674.json"),
    "915": Path("/Users/tangyichuan/.ks-cli/tmp/langbridge-eval-run-statistics-1789703773044.json"),
}

REPORT_URLS = {
    "912": "https://langbridge-eval.test.gifshow.com/evals/report/run_927793432436428807?source=business",
    "915": "https://langbridge-eval.test.gifshow.com/evals/report/run_929533206641774619?source=business",
}

FONT_PATH = "/System/Library/Fonts/STHeiti Light.ttc"
FONT_NAME = "Arial Unicode MS"
NAVY = "1F4E78"
BLUE = "2F75B5"
PALE_BLUE = "EAF2F8"
LIGHT_BLUE = "D9EAF7"
LIGHT_GRAY = "F2F2F2"
MID_GRAY = "666666"
BORDER = "D9D9D9"
RED = "C00000"
GREEN = "2E7D32"


def load_data():
    return {k: json.loads(p.read_text(encoding="utf-8")) for k, p in FILES.items()}


def intent_rows(run):
    return run["summary"]["intentEvaluations"]


def intent_map(run):
    return {x["displayName"]: x for x in intent_rows(run)}


def aggregate(rows, key):
    result = defaultdict(lambda: {"count": 0, "pass": 0, "fail": 0, "inc": 0, "sub": 0})
    for row in rows:
        bucket = result[row[key]]
        bucket["count"] += row["caseCount"]
        bucket["pass"] += row["passCount"]
        bucket["fail"] += row["failCount"]
        bucket["inc"] += row["inconclusiveCount"]
        bucket["sub"] += 1
    for bucket in result.values():
        denom = bucket["pass"] + bucket["fail"] + bucket["inc"]
        bucket["rate"] = bucket["pass"] / denom if denom else None
    return result


def weighted_intent_rate(run):
    rows = intent_rows(run)
    passed = sum(x["passCount"] for x in rows)
    failed = sum(x["failCount"] for x in rows)
    inc = sum(x["inconclusiveCount"] for x in rows)
    return passed / (passed + failed + inc)


def stage_intent(run):
    return next(x for x in run["nodes"] if x["key"] == "stage__intent_gate")


def pct(x):
    return f"{x * 100:.2f}%"


def pp(x):
    return f"{x * 100:+.2f}pp"


def color(hex_value):
    return RGBColor.from_string(hex_value)


def set_cell_fill(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=110, start=100, bottom=110, end=100):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, value=BORDER, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), value)


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_no_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def set_cell_width(cell, inches):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(int(inches * 1440)))
    tc_w.set(qn("w:type"), "dxa")


def set_font(run, size=10.5, bold=False, font_color="000000"):
    run.font.name = FONT_NAME
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT_NAME)
    run._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = color(font_color)


def style_paragraph(paragraph, size=10.5, bold=False, font_color="000000", align=None):
    if align is not None:
        paragraph.alignment = align
    paragraph.paragraph_format.space_after = Pt(5)
    paragraph.paragraph_format.line_spacing = 1.18
    for run in paragraph.runs:
        set_font(run, size=size, bold=bold or run.bold, font_color=font_color)


def add_body(doc, text, bold_lead=None):
    p = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        lead = p.add_run(bold_lead)
        set_font(lead, bold=True)
        rest = p.add_run(text[len(bold_lead):])
        set_font(rest)
    else:
        run = p.add_run(text)
        set_font(run)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.line_spacing = 1.25
    return p


def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    run = p.add_run(text)
    set_font(run)
    p.paragraph_format.left_indent = Inches(0.2)
    p.paragraph_format.first_line_indent = Inches(-0.18)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.18
    return p


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(13 if level == 1 else 9)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    set_font(run, size=16 if level == 1 else 12.5, bold=True)
    return p


def add_table(doc, headers, rows, widths=None, font_size=9.2, alignments=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    header = table.rows[0]
    set_repeat_table_header(header)
    for i, title in enumerate(headers):
        cell = header.cells[i]
        if widths:
            set_cell_width(cell, widths[i])
        set_cell_fill(cell, NAVY)
        set_cell_margins(cell, top=120, bottom=120)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(str(title))
        set_font(r, size=font_size, bold=True, font_color="FFFFFF")
    for r_idx, values in enumerate(rows):
        row = table.add_row()
        set_row_no_split(row)
        for i, value in enumerate(values):
            cell = row.cells[i]
            if widths:
                set_cell_width(cell, widths[i])
            if r_idx % 2 == 1:
                set_cell_fill(cell, PALE_BLUE)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = cell.paragraphs[0]
            p.alignment = (alignments[i] if alignments else WD_ALIGN_PARAGRAPH.LEFT)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.08
            r = p.add_run(str(value))
            set_font(r, size=font_size)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def get_font(size):
    return ImageFont.truetype(FONT_PATH, size)


def draw_distribution_chart(level_912, level_915, output):
    labels = [
        ("商品搜索", "商品搜索"),
        ("商品决策信息获取", "商品决策信息获取"),
        ("其他通识咨询和闲聊", "其他通识咨询&闲聊"),
        ("物流配送咨询", "物流配送咨询"),
        ("商品推荐", "商品推荐"),
        ("历史订单查询", "历史订单查询"),
        ("售后问题", "售后问题"),
        ("平台功能机制政策咨询", "平台功能&机制&政策咨询"),
    ]
    width, height = 1800, 1120
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    title_font = get_font(44)
    label_font = get_font(29)
    value_font = get_font(26)
    legend_font = get_font(28)
    d.text((90, 55), "一级意图覆盖率变化", fill=(0, 0, 0), font=title_font)
    d.text((90, 112), "占 1500 个 Case 的比例  多意图可重复计数", fill=(90, 90, 90), font=legend_font)
    left, right, top, bottom = 470, 1700, 210, 1010
    max_val = 85
    for tick in range(0, 86, 10):
        x = left + (right - left) * tick / max_val
        d.line((x, top, x, bottom), fill=(225, 225, 225), width=2)
        d.text((x - 15, bottom + 15), f"{tick}%", fill=(90, 90, 90), font=value_font)
    d.rectangle((1150, 72, 1190, 104), fill=(130, 145, 165))
    d.text((1205, 68), "912", fill=(50, 50, 50), font=legend_font)
    d.rectangle((1380, 72, 1420, 104), fill=(31, 78, 121))
    d.text((1435, 68), "915", fill=(50, 50, 50), font=legend_font)
    row_h = 95
    for idx, (label, key) in enumerate(labels):
        y = top + idx * row_h
        display = label
        d.text((90, y + 24), display, fill=(0, 0, 0), font=label_font)
        v12 = level_912.get(key, {"count": 0})["count"] / 1500 * 100
        v15 = level_915.get(key, {"count": 0})["count"] / 1500 * 100
        x12 = left + (right - left) * v12 / max_val
        x15 = left + (right - left) * v15 / max_val
        d.rounded_rectangle((left, y + 12, x12, y + 42), radius=7, fill=(130, 145, 165))
        d.rounded_rectangle((left, y + 49, x15, y + 79), radius=7, fill=(31, 78, 121))
        d.text((x12 + 10, y + 8), f"{v12:.2f}%", fill=(60, 60, 60), font=value_font)
        d.text((x15 + 10, y + 45), f"{v15:.2f}%", fill=(31, 78, 121), font=value_font)
    img.save(output, quality=95)


def draw_satisfaction_chart(case12, case15, tag12, tag15, output):
    width, height = 1700, 800
    img = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(img)
    title_font = get_font(44)
    label_font = get_font(31)
    value_font = get_font(30)
    small_font = get_font(26)
    d.text((90, 55), "意图满足度的两个口径", fill=(0, 0, 0), font=title_font)
    d.text((90, 112), "Case 级通过率上升  意图标签加权满足率下降", fill=(90, 90, 90), font=small_font)
    categories = [
        ("Case 级意图满足度", case12 * 100, case15 * 100),
        ("意图标签加权满足率", tag12 * 100, tag15 * 100),
    ]
    left, right, top, bottom = 500, 1570, 210, 680
    for tick in range(0, 101, 20):
        x = left + (right - left) * tick / 100
        d.line((x, top, x, bottom), fill=(225, 225, 225), width=2)
        d.text((x - 18, bottom + 15), f"{tick}%", fill=(90, 90, 90), font=small_font)
    d.rectangle((1130, 72, 1170, 104), fill=(130, 145, 165))
    d.text((1185, 68), "912", fill=(50, 50, 50), font=small_font)
    d.rectangle((1340, 72, 1380, 104), fill=(31, 78, 121))
    d.text((1395, 68), "915", fill=(50, 50, 50), font=small_font)
    for idx, (label, v12, v15) in enumerate(categories):
        y = top + idx * 220
        d.text((90, y + 48), label, fill=(0, 0, 0), font=label_font)
        x12 = left + (right - left) * v12 / 100
        x15 = left + (right - left) * v15 / 100
        d.rounded_rectangle((left, y + 15, x12, y + 65), radius=9, fill=(130, 145, 165))
        d.rounded_rectangle((left, y + 85, x15, y + 135), radius=9, fill=(31, 78, 121))
        d.text((x12 + 12, y + 20), f"{v12:.2f}%", fill=(60, 60, 60), font=value_font)
        d.text((x15 + 12, y + 90), f"{v15:.2f}%", fill=(31, 78, 121), font=value_font)
        delta = v15 - v12
        delta_color = (46, 125, 50) if delta > 0 else (192, 0, 0)
        d.text((left, y + 150), f"变化 {delta:+.2f}pp", fill=delta_color, font=small_font)
    img.save(output, quality=95)


def set_document_styles(doc):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.68)
    section.bottom_margin = Inches(0.68)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)

    normal = doc.styles["Normal"]
    normal.font.name = FONT_NAME
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_NAME)
    normal.font.size = Pt(10.5)

    title = doc.styles["Title"]
    title.font.name = FONT_NAME
    title._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_NAME)
    title.font.size = Pt(24)
    title.font.bold = True
    title.font.color.rgb = color("000000")
    title_ppr = title._element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    for name, size in (("Heading 1", 16), ("Heading 2", 12.5)):
        style = doc.styles[name]
        style.font.name = FONT_NAME
        style._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_NAME)
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color("000000")


def add_footer(section):
    section.footer.is_linked_to_previous = False
    footer = section.footer
    p = footer.paragraphs[0]
    for child in list(p._p):
        if child.tag != qn("w:pPr"):
            p._p.remove(child)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    run = p.add_run("LangBridge 915 与 912 线上回评意图对比")
    set_font(run, size=8.5, font_color=MID_GRAY)
    run = p.add_run("   ")
    set_font(run, size=8.5, font_color=MID_GRAY)
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    p._p.append(fld)


def build_document(data):
    run12, run15 = data["912"], data["915"]
    rows12, rows15 = intent_rows(run12), intent_rows(run15)
    map12, map15 = intent_map(run12), intent_map(run15)
    level12, level15 = aggregate(rows12, "level1"), aggregate(rows15, "level1")
    module12, module15 = aggregate(rows12, "module"), aggregate(rows15, "module")
    stage12, stage15 = stage_intent(run12), stage_intent(run15)
    tag_rate12, tag_rate15 = weighted_intent_rate(run12), weighted_intent_rate(run15)
    mark12 = sum(x["caseCount"] for x in rows12)
    mark15 = sum(x["caseCount"] for x in rows15)

    dist_chart = ASSET_DIR / "intent_distribution.png"
    sat_chart = ASSET_DIR / "intent_satisfaction.png"
    draw_distribution_chart(level12, level15, dist_chart)
    draw_satisfaction_chart(stage12["passRate"], stage15["passRate"], tag_rate12, tag_rate15, sat_chart)

    doc = Document()
    set_document_styles(doc)
    add_footer(doc.sections[0])

    title = doc.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(6)
    title_run = title.add_run("915 与 912 线上回评意图对比报告")
    set_font(title_run, size=24, bold=True)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(14)
    sub_run = subtitle.add_run("意图分布变化  意图满足度变化  整体结论")
    set_font(sub_run, size=11.5, font_color=MID_GRAY)

    lead = doc.add_paragraph()
    lead.paragraph_format.space_after = Pt(10)
    lead.paragraph_format.line_spacing = 1.3
    r = lead.add_run("核心结论  ")
    set_font(r, size=11, bold=True)
    r = lead.add_run(
        "915 的 Case 级意图满足度从 78.23% 提升到 84.42%，但意图标签加权满足率从 96.16% 降至 93.06%。"
        "两次评测没有共同 taskId，且平均每个 Case 的意图标签数从 1.44 降至 1.16。"
        "因此，整体通过率上升主要反映样本结构和任务复杂度变化，不能直接判定模型意图能力整体提升。"
    )
    set_font(r, size=11)

    meta_rows = [
        ["912 回评", "912fix回评", "1500", "1500 份评分成功", "plan 05b2e444"],
        ["915 回评", "915 线上回评", "1500", "1500 份评分成功", "plan 05b2e444"],
    ]
    add_table(
        doc,
        ["版本", "任务名称", "Case 数", "评分状态", "评分方案"],
        meta_rows,
        widths=[0.85, 1.45, 0.75, 1.25, 1.3],
        font_size=9.2,
        alignments=[WD_ALIGN_PARAGRAPH.CENTER] * 5,
    )

    add_heading(doc, "整体结论", 1)
    add_bullet(doc, "915 的 Case 级意图满足度提升 6.18 个百分点，失败 Case 减少 85 个，不确定 Case 减少 25 个。")
    add_bullet(doc, "意图标签层面的加权满足率下降 3.10 个百分点。大多数可比意图没有同步提升，平台规则、售后和异常场景降幅较大。")
    add_bullet(doc, "样本结构发生根本变化。价格预期型商品搜索从 883 个降至 19 个；指定类目搜索、商品对比、物流查询、历史订单和无条件推荐明显增加。")
    add_bullet(doc, "两批 Case 的 taskId 完全不重合。当前结果适合用于观察线上流量结构和风险意图，不适合直接作为版本能力回归结论。")

    add_heading(doc, "评测口径", 1)
    overall_rows = [
        ["Case 数", "1500", "1500", "0"],
        ["意图标签总量", str(mark12), str(mark15), f"{mark15 - mark12:+d}"],
        ["平均每 Case 意图数", f"{mark12 / 1500:.3f}", f"{mark15 / 1500:.3f}", f"{mark15 / 1500 - mark12 / 1500:+.3f}"],
        ["Case 级意图满足度", pct(stage12["passRate"]), pct(stage15["passRate"]), pp(stage15["passRate"] - stage12["passRate"])],
        ["意图标签加权满足率", pct(tag_rate12), pct(tag_rate15), pp(tag_rate15 - tag_rate12)],
        ["意图失败 Case", str(stage12["failCount"]), str(stage15["failCount"]), f"{stage15['failCount'] - stage12['failCount']:+d}"],
        ["意图不确定 Case", str(stage12["inconclusiveCount"]), str(stage15["inconclusiveCount"]), f"{stage15['inconclusiveCount'] - stage12['inconclusiveCount']:+d}"],
    ]
    add_table(
        doc,
        ["指标", "912", "915", "变化"],
        overall_rows,
        widths=[2.45, 1.1, 1.1, 1.1],
        font_size=9.5,
        alignments=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
    )
    add_body(
        doc,
        "Case 级意图满足度按每个 Case 的最终意图门槛统计；意图标签加权满足率按所有意图标签的通过数除以标签总数统计。"
        "915 的标签密度降低 19.4%，多意图任务减少，会提高 Case 通过的概率。这解释了为什么 Case 级通过率上升，而同意图的满足率普遍下降。",
    )

    add_heading(doc, "意图分布变化", 1)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(dist_chart), width=Inches(7.0))
    p.paragraph_format.space_after = Pt(5)
    caption = doc.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_after = Pt(8)
    r = caption.add_run("图 1  一级意图覆盖率变化  多意图 Case 可重复计数")
    set_font(r, size=8.8, font_color=MID_GRAY)

    distribution_rows = [
        ["商品搜索  指定价格预期", "58.87%", "1.27%", "-57.60pp", "主导样本基本退出"],
        ["商品搜索  指定类目", "12.07%", "39.20%", "+27.13pp", "成为最大意图"],
        ["其他通识咨询和闲聊", "16.07%", "2.33%", "-13.73pp", "显著减少"],
        ["物流状态查询", "4.73%", "10.87%", "+6.13pp", "交易中场景增加"],
        ["历史订单查询", "1.40%", "7.33%", "+5.93pp", "交易中场景增加"],
        ["商品推荐  无指定条件", "2.27%", "7.40%", "+5.13pp", "开放式推荐增加"],
        ["多个商品对比决策", "15.67%", "19.67%", "+4.00pp", "对比决策继续扩张"],
    ]
    doc.add_page_break()
    add_table(
        doc,
        ["意图", "912 占比", "915 占比", "变化", "判断"],
        distribution_rows,
        widths=[2.25, 0.85, 0.85, 0.85, 1.55],
        font_size=9.1,
        alignments=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT],
    )
    add_body(
        doc,
        "915 更偏向指定类目搜索、商品比较、物流与历史订单等明确任务。912 则高度集中于价格预期搜索，并包含更多闲聊。"
        "这两个样本集覆盖的用户需求结构不同，整体分数不能直接解释为版本前后能力差异。",
    )

    add_heading(doc, "意图满足度变化", 1)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(sat_chart), width=Inches(6.9))
    p.paragraph_format.space_after = Pt(5)
    caption = doc.add_paragraph()
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_after = Pt(8)
    r = caption.add_run("图 2  Case 级指标与意图标签指标方向相反")
    set_font(r, size=8.8, font_color=MID_GRAY)

    module_rows = []
    for module in ["售前决策", "交易中", "售后", "其他"]:
        a, b = module12[module], module15[module]
        module_rows.append([
            module,
            f"{a['count']} / {pct(a['rate'])}",
            f"{b['count']} / {pct(b['rate'])}",
            pp(b["rate"] - a["rate"]),
        ])
    add_table(
        doc,
        ["模块", "912 标签数和满足率", "915 标签数和满足率", "满足率变化"],
        module_rows,
        widths=[1.2, 1.75, 1.75, 1.1],
        font_size=9.3,
        alignments=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
    )
    add_body(
        doc,
        "售前决策和交易中场景小幅下降；售后下降 12.88 个百分点，其他场景下降 14.56 个百分点。"
        "整体意图标签满足率下降的主要风险集中在售后、平台规则和闲聊等非标准商品搜索场景。",
    )

    add_heading(doc, "需要优先处理的意图", 1)
    priority_names = [
        "商品搜索-指定类目",
        "平台功能&机制&政策咨询-/",
        "商品推荐-无任何指定条件",
        "售后问题-售后问题反馈",
        "商品决策信息获取-单个商品咨询-使用对象/使用场景/使用效果咨询",
        "售后问题-退货/退款/换货申请",
        "物流配送咨询-物流异常问题反馈",
    ]
    priority_rows = []
    for name in priority_names:
        a, b = map12.get(name), map15.get(name)
        priority_rows.append([
            name.replace("-/", ""),
            str(b["caseCount"]),
            pct(a["passRate"]),
            pct(b["passRate"]),
            pp(b["passRate"] - a["passRate"]),
            str(b["failCount"]),
        ])
    add_table(
        doc,
        ["意图", "915 样本", "912 满足率", "915 满足率", "变化", "915 失败"],
        priority_rows,
        widths=[2.7, 0.65, 0.9, 0.9, 0.75, 0.65],
        font_size=8.8,
        alignments=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
    )
    add_body(doc, "指定类目搜索的降幅只有 2.55 个百分点，但 915 中有 588 个样本并产生 28 个失败，是当前失败量最大的高频意图，应优先处理。")
    add_body(doc, "平台功能和政策咨询、售后问题反馈、单个商品使用场景咨询的降幅较大，且样本量足以表明风险，需要分别下钻失败 Case。")

    add_heading(doc, "相对稳定或改善的意图", 1)
    positive_names = [
        "商品决策信息获取-多个商品对比决策",
        "历史订单查询-/",
        "商品搜索-指定店铺范围明确",
        "平台交易信息咨询-找券",
    ]
    positive_rows = []
    for name in positive_names:
        a, b = map12.get(name), map15.get(name)
        positive_rows.append([
            name.replace("-/", ""), str(b["caseCount"]), pct(a["passRate"]), pct(b["passRate"]), pp(b["passRate"] - a["passRate"]),
        ])
    add_table(
        doc,
        ["意图", "915 样本", "912 满足率", "915 满足率", "变化"],
        positive_rows,
        widths=[2.85, 0.75, 1.0, 1.0, 0.85],
        font_size=9.1,
        alignments=[WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
    )
    add_body(
        doc,
        "历史订单查询在样本从 21 个增加到 110 个的同时，满足率提升 3.16 个百分点，是本次最可信的改善。"
        "多个商品对比保持稳定并略有提升。指定店铺范围和找券维持 100%，但样本量较小。",
    )

    add_heading(doc, "建议", 1)
    add_bullet(doc, "把平台功能和政策咨询、售后问题反馈、指定类目搜索作为第一批 Case 下钻对象，分别拆解意图识别、工具路由和最终答复问题。")
    add_bullet(doc, "对 915 的 228 个意图失败 Case 按高频意图排序，优先处理指定类目搜索的 28 个失败、平台政策的 16 个失败和售后问题反馈的 9 个失败。")
    add_bullet(doc, "建立固定回归集，保持 taskId、意图标签和评分方案一致。线上流量回评用于观察分布，固定回归集用于判断版本能力。")
    add_bullet(doc, "后续汇报同时保留 Case 级通过率和意图标签加权满足率，避免多意图密度变化掩盖单意图质量下降。")

    # Landscape appendix
    section = doc.add_section(WD_SECTION.NEW_PAGE)
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Inches(11)
    section.page_height = Inches(8.5)
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.55)
    section.right_margin = Inches(0.55)
    add_footer(section)

    add_heading(doc, "附录  全部意图分布与满足度", 1)
    add_body(doc, "分布占比均以 1500 个 Case 为分母。一个 Case 可包含多个意图，因此各意图占比之和可能超过 100%。")
    all_names = set(map12) | set(map15)
    ordered = sorted(all_names, key=lambda n: (map15.get(n, {}).get("caseCount", 0), map12.get(n, {}).get("caseCount", 0)), reverse=True)
    appendix_rows = []
    for name in ordered:
        a, b = map12.get(name), map15.get(name)
        c12 = a["caseCount"] if a else 0
        c15 = b["caseCount"] if b else 0
        r12 = a["passRate"] if a else None
        r15 = b["passRate"] if b else None
        appendix_rows.append([
            name.replace("-/", ""),
            f"{c12} / {c12 / 1500 * 100:.2f}%",
            f"{c15} / {c15 / 1500 * 100:.2f}%",
            f"{(c15 - c12) / 1500 * 100:+.2f}pp",
            "-" if r12 is None else pct(r12),
            "-" if r15 is None else pct(r15),
            "-" if r12 is None or r15 is None else pp(r15 - r12),
        ])
    appendix_headers = ["意图", "912 数量和占比", "915 数量和占比", "分布变化", "912 满足率", "915 满足率", "满足率变化"]
    appendix_widths = [3.15, 1.15, 1.15, 0.9, 0.9, 0.9, 0.9]
    appendix_alignments = [WD_ALIGN_PARAGRAPH.LEFT] + [WD_ALIGN_PARAGRAPH.CENTER] * 6
    add_table(
        doc,
        appendix_headers,
        appendix_rows[:25],
        widths=appendix_widths,
        font_size=8.0,
        alignments=appendix_alignments,
    )
    doc.add_page_break()
    add_table(
        doc,
        appendix_headers,
        appendix_rows[25:],
        widths=appendix_widths,
        font_size=8.0,
        alignments=appendix_alignments,
    )

    add_heading(doc, "数据来源", 1)
    add_body(doc, f"912 回评  {REPORT_URLS['912']}")
    add_body(doc, f"915 回评  {REPORT_URLS['915']}")
    add_body(doc, "两次评测均使用相同评分方案 plan 05b2e444，评分成功率为 100%。两批任务没有共同 taskId。")

    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    result = build_document(load_data())
    print(result)
