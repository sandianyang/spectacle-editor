import React, { Component } from "react";
// import { findDOMNode } from "react-dom"; // TODO: Uncomment for getBoundingClientRect or remove
import { autorun } from "mobx";
import { Motion, TransitionMotion, spring } from "react-motion";

import SlideMenu from "./slide-menu";
import styles from "./index.css";

// NOTE: These must match up to the actual styles.
const slideHeight = 65;
// NOTE: These are half the value since vertical margins collapse
const slideTopMargin = 5;
const slideBottomMargin = 5;
// Vertical margins collapse so add one more topMargin to the start.
const listTop = 160 + slideTopMargin; // default value will be overwritten on mount
const listBottom = 900;
const listRight = 155;
const listLeft = 5;
const totalSlideHeight = slideHeight + slideTopMargin + slideBottomMargin;

const springSetting1 = { stiffness: 180, damping: 10 };
const springSetting2 = { stiffness: 1000, damping: 50 };

// NOTE: If dragging hits perf issues, memoize this function
// TODO: HANDLE SCROLL!
const getDragIndex = (topOfSlide, currentDragIndex) => {
  const effectiveTop = topOfSlide - listTop;
  const interSlideTop = effectiveTop % totalSlideHeight;

  let index = Math.floor(effectiveTop / totalSlideHeight);

  // Account for margins
  if (index < currentDragIndex && interSlideTop > slideTopMargin) {
    index += 1;
  } else if (index > currentDragIndex && interSlideTop <= slideTopMargin) {
    index -= 1;
  }

  return index;
};

class SlideList extends Component {
  static contextTypes = {
    store: React.PropTypes.object
  };

  constructor(props, context) {
    super(props);

    // TODO: Make sure default state is representative of actual state
    this.state = {
      slideList: context.store.slides,
      mouseOffset: null,
      mouseStart: [0, 0],
      delta: [0, 0], // difference between mouse and circle pos, for dragging
      outside: false, // index of component outside
      isPressed: false
    };
  }

  componentDidMount = () => {
    // We're storing local state for drag/drop functionality
    // Update state whenever our store slides change
    // TODO: Make this animate when undo/redo/add/delete trigger it.
    autorun(() => {
      const slideList = this.context.store.slides;

      this.setState({
        slideList,
        updating: false
      });
    });

    // TODO: Why does this give an incorrect boundingRectTop?
    // listTop = findDOMNode(this).getBoundingClientRect().top + slideTopMargin;
  }

  handleTouchStart = (id, pressLocation, ev) => {
    ev.preventDefault();
    this.handleMouseDown(id, pressLocation, ev.touches[0]);
  }

  handleTouchMove = (ev) => {
    ev.preventDefault();
    this.handleMouseMove(ev.touches[0]);
  }

  handleMouseMove = ({ pageX, pageY }) => {
    const { mouseOffset, mouseStart: [x, y], currentDragIndex, originalDragIndex } = this.state;

    const newDelta = [pageX - x, pageY - y];
    const topOfSlide = pageY + mouseOffset.top;
    const leftOfSlide = pageX + mouseOffset.left;
    const rightOfSlide = pageX + mouseOffset.right;

    // Let the slide overflow halfway for the zero index location.
    if (topOfSlide < listTop && topOfSlide > listTop - (slideHeight / 2)) {
      this.setState({
        delta: newDelta,
        currentDragIndex: 0,
        outside: false
      });

      return;
    }

    // If we're outside of the column, setState to outside
    if (
      rightOfSlide < listLeft ||
      leftOfSlide > listRight ||
      topOfSlide > listBottom ||
      topOfSlide < listTop
    ) {
      this.setState({
        delta: newDelta,
        outside: true,
        currentDragIndex: originalDragIndex
      });

      return;
    }

    let newIndex = getDragIndex(topOfSlide, currentDragIndex);

    const slides = this.context.store.slides;

    // Safety check
    if (newIndex > slides.length) {
      newIndex = slides.length - 1;
    }

    this.setState({
      delta: newDelta,
      currentDragIndex: newIndex,
      outside: false
    });
  }

  handleMouseDown = (id, index, ev) => {
    ev.preventDefault();

    const { pageX, pageY } = ev;
    const { top, right, bottom, left } = this[id].getBoundingClientRect();

    this.context.store.setSelectedSlideIndex(index);
    window.addEventListener("mouseup", this.handleMouseUp);
    window.addEventListener("touchend", this.handleMouseUp);

    // Only do drag if we hold the mouse down for a bit
    this.mouseClickTimeout = setTimeout(() => {
      this.mouseClickTimeout = null;

      this.setState({
        originalDragIndex: index,
        currentDragIndex: index,
        mouseOffset: {
          top: top - pageY,
          right: right - pageX,
          bottom: bottom - pageY,
          left: left - pageX
        },
        delta: [0, 0],
        mouseStart: [pageX, pageY],
        isPressed: true
      });

      window.addEventListener("touchmove", this.handleTouchMove);
      window.addEventListener("mousemove", this.handleMouseMove);
    }, 300);
  }

  handleMouseUp = () => {
    if (this.mouseClickTimeout || this.mouseClickTimeout === 0) {
      clearTimeout(this.mouseClickTimeout);
      window.removeEventListener("mouseup", this.handleMouseUp);
      window.removeEventListener("touchend", this.handleMouseUp);

      this.mouseClickTimeout = null;

      return;
    }

    window.removeEventListener("touchmove", this.handleTouchMove);
    window.removeEventListener("touchend", this.handleMouseUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
    window.removeEventListener("mouseup", this.handleMouseUp);

    const { outside, originalDragIndex, currentDragIndex } = this.state;

    const state = {
      delta: [0, 0],
      outside: false,
      isPressed: false
    };

    // TODO: allow for animations to take place before updating the store
    this.setState(state, () => {
      setTimeout(() => {
        this.setState({
          currentDragIndex: null,
          originalDragIndex: null,
          mouseOffset: null,
          mouseStart: [0, 0],
          delta: [0, 0], // difference between mouse and circle pos, for dragging
          outside: false, // index of component outside
          isPressed: false,
          updating: !outside && currentDragIndex !== originalDragIndex
        });

        if (!outside) {
          this.context.store.moveSlide(originalDragIndex, currentDragIndex);
        }
      }, 200);
    });
  }

  render() {
    const {
      currentDragIndex,
      delta,
      outside,
      originalDragIndex,
      isPressed,
      updating
    } = this.state;

    return (
      <div className={styles.list}>
        <SlideMenu />
        <TransitionMotion
          willLeave={() => ({
            left: spring(-200, springSetting2),
            height: spring(0, springSetting2),
            padding: spring(0, springSetting2)
          })}
          willEnter={() => ({
            left: -200
          })}
          styles={this.state.slideList.map(slide => ({
            key: `${slide.id}key`,
            style: { left: spring(0), height: slideHeight, padding: 5 },
            data: slide
          }))}
        >
          {(slideListStyles) => {
            // If we're outside the column, fill in the vacant spot
            let visualIndex = 0;

            // first render: a, b, c. Second: still a, b, c! Only last one's a, b.
            return (
              <div>
                {slideListStyles.map(({ style, data, key }, i) => {
                  let motionStyle;
                  let x;
                  let y;

                  // Leave a space in this location if we're within column bounds
                  if (!outside && visualIndex === currentDragIndex) {
                    visualIndex += 1;
                  }

                  if (i === originalDragIndex) {
                    [x, y] = delta;

                    y = isPressed ? y : (currentDragIndex - i) * totalSlideHeight;

                    motionStyle = {
                      translateX: updating ? x : spring(x, springSetting2),
                      translateY: updating ? y : spring(y, springSetting2),
                      scale: updating ? 1 : spring(isPressed ? 1.1 : 1, springSetting1),
                      zIndex: isPressed ? 1000 : i
                    };
                  } else {
                    y = (visualIndex - i) * totalSlideHeight;
                    visualIndex += 1;

                    motionStyle = {
                      translateX: updating ? 0 : spring(0, springSetting2),
                      translateY: updating ? y : spring(y, springSetting2),
                      scale: 1,
                      zIndex: i
                    };
                  }

                  return (
                    <div key={key} style={{ ...style, position: "relative" }}>
                    <Motion style={motionStyle}>
                      {({ translateY, translateX, scale, zIndex }) => (
                        <div
                          className={styles.slideWrapper}
                          ref={(ref) => { this[data.id] = ref; }}
                          onMouseDown={this.handleMouseDown.bind(this, data.id, i)}
                          onTouchStart={this.handleTouchStart.bind(this, data.id, i)}
                          style={{
                            zIndex,
                            backgroundColor: data.color,
                            transform: `
                              translate3d(${translateX}px,
                              ${translateY}px, 0)
                              scale(${scale})
                            `
                          }}
                        >
                          <div>{data.id}</div>
                        </div>
                      )}
                    </Motion>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </TransitionMotion>

      </div>
    );
  }
}

export default SlideList;
