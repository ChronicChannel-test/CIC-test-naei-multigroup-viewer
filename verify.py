
import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Construct the file path to the HTML file
        # The script is in the root, and the HTML is also in the root
        file_path = "file://" + os.path.abspath("linechart.html")

        print(f"Navigating to {file_path}")
        await page.goto(file_path)

        # Wait for the chart to be rendered
        await page.wait_for_selector('#chart_div svg')

        # Take a screenshot
        screenshot_path = "linechart_verification.png"
        await page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
