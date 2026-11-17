'use client';
import { InfoSection } from './InfoSection';

export function InnovationSection() {
    const items = [
        { 
            title: "Exclusive Discounts", 
            desc: "Pay for business and personal administration services with direct benefits." 
        },
        { 
            title: "Access to Experiences", 
            desc: "Your LXR balance is your ticket to events, advanced tools, and premium ecosystem features." 
        },
        { 
            title: "Savings on Consumption", 
            desc: "Get perks at partner merchants, from coffee shops to technology, through our payment gateway." 
        },
        { 
            title: "Active Governance", 
            desc: "Participate in the development of new features. Your voice helps decide where the engine grows." 
        },
    ];

    return (
        <InfoSection 
            title="What exactly is elizmey?"
            subtitle="elizmey is an intelligent infrastructure designed to act as a unified command center. It is the bridge between strategy and operational execution, evolving with your business."
            description="By using elizmey, you gain superpowers within our network:"
            items={items}
            imageSrc="/assets/rai-logo-circular.png"
            imageClassName="object-contain p-12"
            showButton={true}
            buttonText="Watch the movie"
            imageRight={true}
            gradient="from-blue-600/30 via-purple-500/10 to-transparent"
        />
    );
}

