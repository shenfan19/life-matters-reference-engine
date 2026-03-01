import React, { useState, useEffect } from 'react';
import { useI18n } from '../core/i18n';

interface Story {
    key: string;
    title: string;
    description?: string;
    difficulty?: string;
    category?: string;
    levels?: any[];
}

interface StoryLoaderProps {
    onSelect: (story: Story) => void;
    onGoToSimulation: () => void;
}

const StoryLoader: React.FC<StoryLoaderProps> = ({ onSelect, onGoToSimulation }) => {
    const { t } = useI18n();
    const [stories, setStories] = useState<Story[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStories = async () => {
            try {
                const response = await fetch('http://localhost:8000/api/files');
                const result = await response.json();

                if (result.success && result.data) {
                    // Find the 'stories' folder in the mods tree
                    const modsFolder = result.data.find((item: any) => item.key === 'mods');
                    const storiesFolder = modsFolder?.children?.find((item: any) => item.key === 'stories');

                    if (storiesFolder && storiesFolder.children) {
                        const storyFiles = storiesFolder.children.filter((item: any) => item.type === 'file');

                        // Map them to Story interface
                        const mappedStories = storyFiles.map((item: any) => ({
                            key: item.key,
                            title: item.title.replace('.yaml', '').replace('.yml', ''),
                            description: item.description || 'No description available.',
                            difficulty: item.difficulty || 'Normal',
                            category: item.category || 'Story',
                            levels: item.levels || []
                        }));

                        setStories(mappedStories);
                    } else {
                        setError('No stories found in mods/stories');
                    }
                } else {
                    setError('Failed to fetch mods tree');
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchStories();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#2b231d] text-[#dcc8a4]">
                <div className="text-2xl animate-pulse">Loading Stories...</div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#2b231d',
            backgroundImage: 'linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url("https://www.transparenttextures.com/patterns/dark-leather.png")',
            color: '#dcc8a4',
            fontFamily: '"Crimson Pro", serif',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px'
        }}>
            <h1 style={{ fontSize: '48px', marginBottom: '10px', fontFamily: '"Playfair Display", serif' }}>
                {t('app.title') || 'Life Matters: Card Game'}
            </h1>
            <p style={{ fontSize: '18px', opacity: 0.8, marginBottom: '60px' }}>
                {t('menu.scenary_library') || 'Scenary Library'} - 选择一个故事开始
            </p>

            {error && (
                <div style={{ color: '#ff4d4f', marginBottom: '20px' }}>
                    Error: {error}
                </div>
            )}

            <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '1200px' }}>
                {stories.length === 0 && !error && <div>No stories found in mods/stories</div>}
                {stories.map(story => (
                    <div
                        key={story.key}
                        onClick={() => onSelect(story)}
                        style={{
                            width: '280px',
                            height: '400px',
                            background: '#dcc8a4',
                            color: '#2c2c2c',
                            border: '4px double #8b5a2b',
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                            backgroundImage: 'url("https://www.transparenttextures.com/patterns/old-wall.png")',
                            position: 'relative'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-10px)';
                            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        <div style={{ fontSize: '12px', color: '#8b0000', fontWeight: 'bold', marginBottom: '10px' }}>
                            {story.category}
                        </div>
                        <h2 style={{ fontSize: '24px', margin: '0 0 15px 0' }}>{story.title}</h2>
                        <p style={{ fontSize: '14px', flex: 1, lineHeight: '1.6', overflow: 'hidden' }}>
                            {story.description}
                        </p>
                        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '15px', color: '#8b5a2b' }}>
                            Difficulty: {story.difficulty}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '60px' }}>
                <button
                    onClick={onGoToSimulation}
                    style={{
                        background: 'none',
                        border: '1px solid #b87333',
                        color: '#b87333',
                        padding: '12px 24px',
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'background 0.3s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(184,115,51,0.1)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                >
                    {t('game.go_sim') || '返回仿真平台 Simulation Platform'}
                </button>
            </div>
        </div>
    );
};

export default StoryLoader;
