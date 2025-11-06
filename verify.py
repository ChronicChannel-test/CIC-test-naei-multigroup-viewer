import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        # Listen for page errors
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

        await page.goto('file:///app/CIC-test-naei-linechart/v2.4-shared-CIC-testdb/index.html')

        try:
            # Wait longer for the selector
            await page.wait_for_selector('#chart_div svg', timeout=60000)
            print("SUCCESS: Chart SVG found!")
            await page.screenshot(path='screenshot.png')
        except Exception as e:
            print(f"ERROR: Failed to find chart SVG. {e}")
            # Take a screenshot anyway to see what the page looks like
            await page.screenshot(path='screenshot_error.png')

        await browser.close()

asyncio.run(main())
