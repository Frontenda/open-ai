import { Fragment, useReducer, useRef } from 'react';
import { CodeBlock } from './components/CodeBlock';
import { Highlight } from './components/Highlight';
import { useChatStream } from './hooks/useChatStream';
import './App.css';

/*** List available models ***/
// const listOfModels = await openai.listModels();

// TODO: Context Infos (Verlauf speichern) - Achtung: sind mehr Token und kostet mehr
// TODO: API response streamen
// TODO: prompts templates für typische Fälle und ich dann nur Input values ausfüllen
// TODO: add model select button mit Hinweis und Link Pricing OpenAI: gpt-4 is more expensive
// TODO: model 3.5 für tests nutzen, da günstiger: https://openai.com/pricing

const formatDate = (date: Date) =>
  date.toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  });

const backTicksRegex = /`{3}/;
const codeBlockRegex = /`{3}(\w+)\n([\s\S]+?)\n`{3}/;
const singleBackTickRegex = /`(?!`+)/;

export const App = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [shouldHighlightSyntax, switchCheckbox] = useReducer((prev) => !prev, false);

  // V2 Response Streaming with Context Memory
  const { messages, submitStreamingPrompt, resetMessages, isLoading, closeStream } = useChatStream({
    model: 'gpt-3.5-turbo',
    apiKey: import.meta.env.VITE_OPEN_AI_KEY
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inputRef.current) return;

    const content = shouldHighlightSyntax
      ? `${inputRef.current.value} Return your response with code blocks using triple backticks before and after the block and with the language identifier for syntax highlighting.`
      : inputRef.current.value;

    submitStreamingPrompt([{ role: 'user', content }]);
  };

  const createCodeBlock = (block: string, language = '') => <CodeBlock code={block} language={language} />;
  const createHighlightBlock = (text: string) => <Highlight>{text}</Highlight>;

  const addCodeBlock = (codeBlock: RegExpMatchArray, currentText: string) => {
    const language = codeBlock[1];
    return currentText.split(backTicksRegex).map((part, index) => {
      if (index % 2 === 1) {
        const partWithoutLanguage = part.replace(language, '');
        return createCodeBlock(partWithoutLanguage, language);
      }
      return part;
    });
  };

  const addCodeBlockWithoutLanguage = (currentText: string) => {
    return currentText.split(backTicksRegex).map((part, index) => {
      if (index % 2 === 1) {
        return createCodeBlock(part);
      }
      return part;
    });
  };

  const addHighlighting = (currentResponse: (string | JSX.Element)[]) => {
    return currentResponse.flatMap((part) => {
      if (typeof part !== 'string') return part;

      const highlightedPart = part.split(singleBackTickRegex).map((subPart, index) => {
        if (index % 2 === 1) {
          return createHighlightBlock(subPart);
        }
        return subPart;
      });

      return highlightedPart;
    });
  };

  const getFormattedChatResponse = (currentText: string) => {
    let formattedChatResponse: (string | JSX.Element)[] = [currentText];

    const codeBlock = currentText.match(codeBlockRegex);

    if (codeBlock) {
      formattedChatResponse = addCodeBlock(codeBlock, currentText);
    } else if (backTicksRegex.test(currentText)) {
      formattedChatResponse = addCodeBlockWithoutLanguage(currentText);
    }

    if (singleBackTickRegex.test(currentText)) {
      formattedChatResponse = addHighlighting(formattedChatResponse);
    }

    return formattedChatResponse;
  };

  return (
    <>
      <main className="app">
        <form className="chat-form" onSubmit={handleSubmit}>
          <textarea className="chat-form__input" ref={inputRef} autoFocus placeholder="Schreibe eine Nachricht ..." />
          <div className="chat-form__buttons">
            <button
              type="submit"
              className="button"
              disabled={messages.length > 0 && messages[messages.length - 1].meta.loading}
            >
              Submit
            </button>
            <button type="reset" className="button" onClick={resetMessages} disabled={isLoading}>
              Reset Context
            </button>
          </div>

          <div className="checkbox">
            <input
              className="checkbox__input"
              type="checkbox"
              id="syntax-highlighting"
              checked={shouldHighlightSyntax}
              onChange={switchCheckbox}
            />
            <label className="checkbox__label" htmlFor="syntax-highlighting">
              Add Syntax Highlighting
            </label>
          </div>
        </form>

        <section className="chat-response-list">
          {messages.length === 0 && <div>Noch keine Nachricht im Chat (Streaming)</div>}

          {messages.length > 0 &&
            messages.map((chatResponse, index) => {
              const formattedChatResponse = getFormattedChatResponse(chatResponse.content);

              return (
                <Fragment key={index}>
                  <div className="chat-response-list__role">
                    {chatResponse.role === 'assistant' ? 'ChatGPT' : 'User'}
                  </div>
                  <div className="chat-response-list__content">
                    <pre className="chat-response-list__response">
                      {formattedChatResponse.map((content, index) => (
                        <Fragment key={index}>{content}</Fragment>
                      ))}
                    </pre>
                    {!chatResponse.meta.loading && (
                      <div className="meta-data">
                        <div className="meta-data__item">Zeit: {formatDate(new Date(chatResponse.timestamp))}</div>
                        {chatResponse.role === 'assistant' && (
                          <>
                            <div className="meta-data__item">Tokens: {chatResponse.meta.chunks.length}</div>
                            <div className="meta-data__item">Antwort Zeit: {chatResponse.meta.responseTime}</div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
        </section>
      </main>
      <button className={`button button--abort ${isLoading ? 'active' : ''}`} onClick={closeStream}>
        Abfrage abbrechen
      </button>
    </>
  );
};
