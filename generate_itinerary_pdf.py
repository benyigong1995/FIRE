#!/usr/bin/env python3

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.units import inch


def build_pdf(output_path: str) -> None:
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.9 * inch,
        bottomMargin=0.9 * inch,
        title="Detailed Itinerary",
        author="Benyi Gong",
    )

    title_style = ParagraphStyle(
        name="Title",
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=14,
    )

    section_style = ParagraphStyle(
        name="Section",
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        alignment=TA_LEFT,
        spaceBefore=10,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        name="Body",
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        alignment=TA_LEFT,
        spaceAfter=6,
    )

    elements = []
    elements.append(Paragraph("Detailed Itinerary", title_style))

    # Travel section
    elements.append(Paragraph("Travel", section_style))
    elements.append(
        Paragraph(
            "<b>Planned U.S. entry:</b> On or about September 10, 2025 (subject to visa issuance and passport return)",
            body_style,
        )
    )
    elements.append(
        Paragraph(
            "<b>Inbound travel:</b> Vancouver (YVR) to San Francisco (SFO) by air.",
            body_style,
        )
    )
    elements.append(
        Paragraph(
            "<b>Arrival airport:</b> San Francisco International Airport (SFO). On regular workdays, I will commute to the primary work location in Palo Alto, CA.",
            body_style,
        )
    )

    # Employment section
    elements.append(Paragraph("Employment", section_style))
    elements.append(
        Paragraph(
            "<b>Employment period:</b> For the duration of H-1B validity",
            body_style,
        )
    )

    # Employer section
    elements.append(Paragraph("Employer", section_style))
    elements.append(Paragraph("Amazon.com Services LLC", body_style))

    # Work location section
    elements.append(Paragraph("Primary work location", section_style))
    elements.append(Paragraph("611 Cowper St, Palo Alto, CA 94301-1839, USA", body_style))

    # Work schedule section
    elements.append(Paragraph("Work schedule", section_style))
    elements.append(
        Paragraph(
            "Monday–Friday, 40 hours per week (approximately 9:00 AM–5:00 PM)",
            body_style,
        )
    )

    # Supervisor section
    elements.append(Paragraph("Supervisor", section_style))
    elements.append(Paragraph("Anjali Chadha", body_style))
    elements.append(Paragraph("Email: anjch@amazon.com", body_style))

    # Business travel section
    elements.append(Paragraph("Business travel", section_style))
    elements.append(Paragraph("None planned.", body_style))

    # Residential address section
    elements.append(Paragraph("Residential address (for reference)", section_style))
    elements.append(Paragraph("1121 Lafayette Dr, Sunnyvale, CA 94087, USA", body_style))

    doc.build(elements)


if __name__ == "__main__":
    build_pdf("Gong_Benyi_EP5665625_Detailed_Itinerary.pdf")


