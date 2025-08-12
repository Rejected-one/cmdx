function ai(cmd) {
    $.ajax({
        url: '/learn',
        type: "POST",
        dataType: 'json',
        data: { command: cmd },
        success: function (data) {
            if (data && data.output !== undefined) {
                const outputText = String(data.output);
                const outputId = 'output-' + Date.now();
                const $outputDiv = $(`<div class="command-output" id="${outputId}"></div>`);
                $outputDiv.text(outputText);
                $outputDiv.append(`<button class="copy-btn" data-output="${outputId}">کپی</button>`);
                $('#terminal-output').append($outputDiv);

                // حالا به markdown تبدیل کن
                convert(); // این فقط آخرین بلاک را تغییر می‌دهد
            } else {
                $('#terminal-output').append('<div class="command-output command-error">پاسخ نامعتبر از سرور</div>');
            }
            scrollToBottom();
        },
        error: function () {
            $('#terminal-output').append('<div class="command-output command-error">هوش مصنوعی پاسخ نداد. اینترنت خود را چک کنید.</div>');
            scrollToBottom();
        }
    });
}

// === DOMContentLoaded بخش غیر jQuery ===
document.addEventListener('DOMContentLoaded', function () {
    const foldersContainer = document.querySelector('.folders');
    let isScrolling = false;
    let lastScrollTime = 0;

    // فعال کردن اسکرول نرم با چرخ موس
    foldersContainer.addEventListener('wheel', function (e) {
        const now = Date.now();

        // محدود کردن فرکانس اسکرول
        if (now - lastScrollTime < 16) { // ~60fps
            e.preventDefault();
            return;
        }
        lastScrollTime = now;

        // محاسبه میزان اسکرول
        const scrollAmount = e.deltaY * 1.5; // افزایش سرعت اسکرول

        // انجام اسکرول
        if (!isScrolling) {
            isScrolling = true;

            window.requestAnimationFrame(() => {
                foldersContainer.scrollBy({
                    top: scrollAmount,
                    behavior: 'smooth'
                });
                isScrolling = false;
            });

            e.preventDefault();
        }
    }, { passive: false });

    // ایجاد tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    // پایه‌ی ساده استایل اگر CSS نداری:
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.padding = '4px 8px';
    tooltip.style.background = 'rgba(0,0,0,0.75)';
    tooltip.style.color = '#fff';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    const buttons = document.querySelectorAll('.drive, .folders button');
    buttons.forEach(button => {
        button.addEventListener('mousemove', function (e) {
            tooltip.textContent = this.textContent.trim();
            tooltip.style.display = 'block';
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        });

        button.addEventListener('mouseout', function () {
            tooltip.style.display = 'none';
        });
    });

    // Auto-scroll to bottom
    function scrollToBottom() {
        const terminal = document.getElementById('terminal-output');
        if (terminal) terminal.scrollTop = terminal.scrollHeight;
    }

    // Auto-focus input field
    const inputText = document.querySelector('.input-text');
    if (inputText) inputText.focus();

    // Scroll to bottom on page load
    scrollToBottom();
});

// === jQuery-ready ===
$(document).ready(function () {
    const $input = $('#command-input');
    const $suggestionsBox = $('#suggestions-box');
    let currentSuggestions = [];
    let selectedIndex = -1;

    // تاریخچه دستورات از متغیر global (در index.html مقداردهی شود) یا از localStorage
    let commandHistory = window.commandHistory || [];
    let historyIndex = -1;

    // بارگذاری از localStorage اگر استفاده می‌کنی
    try {
        const stored = localStorage.getItem('commandHistory');
        if (stored) {
            commandHistory = JSON.parse(stored);
            window.commandHistory = commandHistory;
        }
    } catch (e) {
        console.warn('خطا در بارگذاری تاریخچه از localStorage', e);
    }

    // مدیریت رویداد input
    $input.on('input', function () {
        const inputText = $(this).val();
        const lastWord = inputText.split(' ').pop();
        if (lastWord.length > 0) {
            fetchSuggestions(lastWord, inputText);
        } else {
            hideSuggestions();
        }
        historyIndex = -1;
    });

    // مدیریت رویدادهای صفحه‌کلید
    $input.on('keydown', function (e) {
        const cmd = $(this).val();


        if ($suggestionsBox.is(':visible')) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateSuggestions(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateSuggestions(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0) {
                    selectSuggestion(currentSuggestions[selectedIndex]);
                } else if (cmd.trim()) {
                    addToHistory(cmd);
                    const commandInput = document.getElementById("command-input");
                    if (commandInput.value.includes("Learn\\")) {
                        ai(cmd);
                    } else {
                        runCommand(cmd);
                    };
                    $(this).val('');
                    hideSuggestions();
                } else {
                    hideSuggestions();
                }
            } else if (e.key === 'Tab') {
                if (currentSuggestions.length > 0) {
                    e.preventDefault();
                    selectSuggestion(currentSuggestions[0]);
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        } else {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    $input.val(commandHistory[commandHistory.length - 1 - historyIndex]);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    $input.val(commandHistory[commandHistory.length - 1 - historyIndex]);
                } else if (historyIndex === 0) {
                    historyIndex = -1;
                    $input.val('');
                }
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                if (cmd.trim()) {
                    addToHistory(cmd);
                    const commandInput = document.getElementById("command-input");
                    if (commandInput.value.includes("Learn\\")) {
                        ai(cmd);
                    } else {
                        runLiveCommand(cmd);
                    };
                    $(this).val('');
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (cmd.trim()) {
                    addToHistory(cmd);

                    const commandInput = document.getElementById("command-input");
                    if (commandInput.value.includes("Learn\\")) {
                        ai(cmd);
                    } else {
                        runCommand(cmd);
                    };

                    $(this).val('');
                }
            }
        }
    });


    // انتخاب پیشنهاد با کلیک
    $suggestionsBox.on('click', '.suggestion-item', function () {
        const cmd = $(this).data('command');
        selectSuggestion(currentSuggestions.find(s => s.command === cmd));
    });

    // مخفی کردن پیشنهادات هنگام کلیک خارج
    $(document).on('click', function (e) {
        if (!$(e.target).closest('.command-input, .suggestions-box').length) {
            hideSuggestions();
        }
    });

    // دریافت پیشنهادات از سرور
    function fetchSuggestions(inputText, inputTextorg) {

        console.log('fetchSuggestions for', inputText);
        const dangerousCommands = [
            "del",
            "rmdir",
            "format",
            "taskkill",
            "sfc",
            "shutdown"
        ];

        if (dangerousCommands.includes(inputTextorg.split(" ")[0])) {
            const element = document.getElementById("command-input");
            element.style.color = "red"; // تصحیح شده
            // یا اگر می‌خواهید چندین استایل اعمال کنید:
            // element.style.cssText = "color: red; font-weight: bold;";
        } else {
            const element = document.getElementById("command-input");
            if (element.style.color !== "rgb(74, 237, 74)" && element.style.color !== "rgb(244, 85, 0)") {
                element.style.color = "rgb(244, 85, 0)";

            }


        };


        $.get('/suggest', { command: inputText })
            .done(function (data) {
                if (data.suggestions && data.suggestions.length > 0) {
                    showSuggestions(data.suggestions, inputTextorg);
                } else {
                    hideSuggestions();
                }
            })
            .fail(function () {
                console.error('Error fetching suggestions');
                hideSuggestions();
            });
    }

    // نمایش پیشنهادات
    function showSuggestions(suggestions, inputTextorg) {
        const element = document.getElementById("command-input");
        if ((suggestions[0].command === (inputTextorg.split(" ")[0])) && element.style.color !== "red") {
            element.style.color = "rgb(74, 237, 74)"
        } else {
            if (element.style.color !== "red" && element.style.color !== "rgb(244, 85, 0)") {
                element.style.color = "rgb(244, 85, 0)";

            }
        };
        if ((String(suggestions[0].command) !== String(inputTextorg.split(" ")[0])) && element.style.color !== "red") {
            element.style.color = "rgb(244, 85, 0)";
        };
        console.log((String(suggestions[0].command) , String(inputTextorg.split(" ")[0])))
        currentSuggestions = suggestions;
        $suggestionsBox.empty();
        selectedIndex = -1;

        suggestions.forEach((suggestion, index) => {
            let params = '';
            if (suggestion.parameters && suggestion.parameters.length > 0) {
                params = '<div class="params">' +
                    suggestion.parameters.map(p => `<span>${p.name}: ${p.description}</span>`).join('<br>') +
                    '</div>';
            }
            let examples = '';
            if (suggestion.examples && suggestion.examples.length > 0) {
                examples = '<div class="examples">' +
                    suggestion.examples.map(e => `<span>${e}</span>`).join('<br>') +
                    '</div>';
            }
            const $item = $(`
                <div class="suggestion-item" data-command="${suggestion.command}" data-index="${index}">
                    <span class="cmd">${suggestion.command}</span>
                    <span class="desc">${suggestion.description}</span>
                    ${params}
                    ${examples}
                </div>
            `);
            $suggestionsBox.append($item);
        });

        positionSuggestionsBox();
        $suggestionsBox.css('display', 'block');
    }

    // موقعیت دهی باکس پیشنهادات
    function positionSuggestionsBox() {
        const $inp = $('#command-input');
        $suggestionsBox.css({
            width: $inp.outerWidth()
        });
    }

    // ناوبری در پیشنهادات با صفحه‌کلید
    function navigateSuggestions(direction) {
        const items = $suggestionsBox.find('.suggestion-item');
        if (items.length === 0) return;

        items.removeClass('highlighted');

        selectedIndex += direction;

        if (selectedIndex < 0) selectedIndex = items.length - 1;
        if (selectedIndex >= items.length) selectedIndex = 0;

        const $selectedItem = items.eq(selectedIndex);
        $selectedItem.addClass('highlighted');

        $suggestionsBox.scrollTop(
            $selectedItem.position().top + $suggestionsBox.scrollTop()
        );
    }

    // انتخاب یک پیشنهاد
    function selectSuggestion(suggestion) {
        if (!suggestion) return;

        $input.val(suggestion.command);
        $input.focus();


        hideSuggestions();
    }

    // مخفی کردن باکس پیشنهادات
    function hideSuggestions() {
        $suggestionsBox.hide();
        selectedIndex = -1;
        currentSuggestions = [];
    }

    // دکمه‌های کپی
    $(document).on('click', '.copy-btn', function () {
        const outputId = $(this).data('output');
        const text = $('#' + outputId).clone()
            .children('button').remove().end()
            .text().trim();
        navigator.clipboard.writeText(text);
        $(this).text('کپی شد!').css('background', '#FFD700');
        setTimeout(() => {
            $(this).text('کپی').css('background', '#4AF626');
        }, 1200);
    });
});

// === تاریخچه ===
function addToHistory(cmd) {
    if (!cmd || !cmd.trim()) return;
    // چون commandHistory از scope بیرون نیست، از window استفاده می‌کنیم
    window.commandHistory = window.commandHistory || [];
    if (window.commandHistory.length === 0 || window.commandHistory[window.commandHistory.length - 1] !== cmd) {
        window.commandHistory.push(cmd);
        // persist اگر خواستی
        try {
            localStorage.setItem('commandHistory', JSON.stringify(window.commandHistory));
        } catch (e) {
            console.warn('ذخیره تاریخچه موفق نبود', e);
        }
    }
}

// === دستورات ===
let liveRequest = null;

function runLiveCommand(cmd) {
    addToHistory(cmd);
    $('#terminal-output').append('<div class="command-line"><span class="prompt">&gt;</span> <span class="command">' + escapeHtml(cmd) + '</span></div>');
    if (liveRequest) {
        liveRequest.abort();
    }
    liveRequest = $.ajax({
        url: '/live',
        type: 'POST',
        data: { command: cmd },
        xhrFields: {
            onprogress: function (e) {
                $('#terminal-output').append(e.currentTarget.response);
                scrollToBottom();
            }
        },
        success: function () { },
        error: function () {
            $('#terminal-output').append('<div class="command-output">خطا در اجرا یا کنسل شد</div>');
        }
    });
}

// جایگزین برای اینتر ساده؛ اگر بک‌اندت route متفاوت داره این‌جا تنظیمش کن
function runCommand(cmd) {
    addToHistory(cmd);
    $('#terminal-output').append('<div class="command-line"><span class="prompt">&gt;</span> <span class="command">' + escapeHtml(cmd) + '</span></div>');

    $.ajax({
        url: '/run',
        type: 'POST',
        dataType: 'json', // مهم: پاسخ رو به‌عنوان JSON بگیریم
        data: { command: cmd },
        success: function (data) {
            if (data && data.output !== undefined) {
                const safeOutput = escapeHtml(String(data.output)).replace(/\n/g, '<br>');
                $('#terminal-output').append('<div class="command-output">' + safeOutput + '</div>');
            } else {
                $('#terminal-output').append('<div class="command-output command-error">پاسخ نامعتبر از سرور</div>');
            }
            scrollToBottom();
        },
        error: function () {
            $('#terminal-output').append('<div class="command-output command-error">خطا در اجرای معمولی</div>');
            scrollToBottom();
        }
    });
}


// کمک برای فرار از HTML در خروجی
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// کنترل جهانی برای Escape (کنسل کردن لایو)
$(document).on('keydown', function (e) {
    if (e.key === 'Escape') {
        if (liveRequest) {
            liveRequest.abort();
            liveRequest = null;
            $('#terminal-output').append('<div class="command-output command-warning">دستور کنسل شد</div>');
            scrollToBottom();
        }
    }
});

// اسکرول خودکار بعد از هر اجرا
function scrollToBottom() {
    const terminal = document.getElementById('terminal-output');
    if (terminal) terminal.scrollTop = terminal.scrollHeight;
}

// پاک کردن کنسول (اگر دکمه‌ای وجود دارد)
$('#clear-console').on('click', function () {
    const $terminalOutput = $('#terminal-output');
    $terminalOutput.empty();
    console.log("صفحه ترمینال پاک شد (کلاینت)");

    // درخواست برای پاک‌سازی سرور
    $.ajax({
        url: '/clear_history',
        type: 'POST',
        success: function (response) {
            console.log("تاریخچه سرور پاک شد:", response);
        },
        error: function (xhr, status, error) {
            console.error("خطا در پاک کردن تاریخچه سرور:", status, error);
            $terminalOutput.append('<div class="command-output command-error">خطا در پاک کردن تاریخچه سرور</div>');
            scrollToBottom();
        }
    });
});
function convert() {
    const outputs = document.querySelectorAll('.command-output');
    if (outputs.length === 0) return;

    const lastOutput = outputs[outputs.length - 1];
    const textContent = lastOutput.textContent || lastOutput.innerText;

    if (!textContent.trim()) return;

    try {
        const htmlOutput = marked.parse(textContent);

        // ذخیره دکمه کپی
        const copyBtn = lastOutput.querySelector('.copy-btn');
        const copyData = copyBtn ? copyBtn.dataset.output : '';

        // جایگزینی محتوا
        lastOutput.innerHTML = htmlOutput;

        // دوباره دکمه کپی را اضافه کن
        if (copyData) {
            const newBtn = document.createElement('button');
            newBtn.className = 'copy-btn';
            newBtn.dataset.output = copyData;
            newBtn.textContent = 'کپی';
            lastOutput.appendChild(newBtn);
        }
    } catch (e) {
        console.error("خطا در تبدیل Markdown:", e);
    }
}
